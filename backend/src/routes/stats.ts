import { Router } from 'express';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, dispositionCategoryFor, jobs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

export const statsRouter = Router();

statsRouter.use(requireAuth);

statsRouter.get('/', async (_req, res) => {
  const [totals] = await db
    .select({
      totalCandidates: count(candidates.id),
      avgScore: sql<number>`cast(coalesce(round(avg(${candidates.qualificationScore})), 0) as int)`,
    })
    .from(candidates);

  const [openJobs] = await db
    .select({ openJobs: count(jobs.id) })
    .from(jobs)
    .where(eq(jobs.status, 'open'));

  const byStage = await db
    .select({ stage: candidates.stage, value: count(candidates.id) })
    .from(candidates)
    .groupBy(candidates.stage);

  const bySource = await db
    .select({ source: candidates.source, value: count(candidates.id) })
    .from(candidates)
    .groupBy(candidates.source)
    .orderBy(sql`count(${candidates.id}) desc`);

  res.json({
    totalCandidates: totals?.totalCandidates ?? 0,
    avgScore: totals?.avgScore ?? 0,
    openJobs: openJobs?.openJobs ?? 0,
    byStage,
    bySource,
  });
});

/**
 * Pipeline health — the metrics the stage-event log exists to make possible.
 *
 * These cannot be derived from candidate rows alone: a row only knows where a candidate is
 * now, not when they got there or what they passed through. Everything here reads from
 * candidate_stage_events.
 */
statsRouter.get('/pipeline', async (_req, res) => {
  // Time to hire: application → 'hired', per candidate, in days.
  const [hireTime] = await db.execute<{
    hires: number;
    median_days: number | null;
    avg_days: number | null;
  }>(sql`
    WITH applied AS (
      SELECT candidate_id, min(created_at) AS applied_at
      FROM candidate_stage_events GROUP BY candidate_id
    ),
    hired AS (
      SELECT candidate_id, min(created_at) AS hired_at
      FROM candidate_stage_events WHERE to_stage = 'hired' GROUP BY candidate_id
    )
    SELECT
      count(*)::int AS hires,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (h.hired_at - a.applied_at)) / 86400
      )::float8 AS median_days,
      avg(EXTRACT(EPOCH FROM (h.hired_at - a.applied_at)) / 86400)::float8 AS avg_days
    FROM hired h JOIN applied a USING (candidate_id)
  `);

  /*
   * Time to fill: requisition approved → the role's first hire.
   *
   * A different clock from time-to-hire above, and the one execs usually mean. Time-to-hire
   * measures a candidate (applied → hired) and so ignores however long the role sat open
   * before anyone applied; this measures the role.
   *
   * Roles approved but not yet filled are excluded — counting them as 0 would drag the median
   * down exactly when hiring is slow. They are reported separately as open requisitions.
   */
  const [fillTime] = await db.execute<{
    filled: number;
    median_days: number | null;
    avg_days: number | null;
  }>(sql`
    WITH first_hire AS (
      SELECT c.job_id, min(e.created_at) AS hired_at
      FROM candidate_stage_events e
      JOIN candidates c ON c.id = e.candidate_id
      WHERE e.to_stage = 'hired'
      GROUP BY c.job_id
    )
    SELECT
      count(*)::int AS filled,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (h.hired_at - j.requisition_approved_at)) / 86400
      )::float8 AS median_days,
      avg(EXTRACT(EPOCH FROM (h.hired_at - j.requisition_approved_at)) / 86400)::float8 AS avg_days
    FROM first_hire h
    JOIN jobs j ON j.id = h.job_id
    WHERE j.requisition_approved_at IS NOT NULL
      -- Guards against a backdated approval landing after its own hire, which would
      -- contribute a negative duration and silently pull the median below zero.
      AND h.hired_at >= j.requisition_approved_at
  `);

  // Roles approved and still open with nobody hired — the number that makes the approval date
  // useful from day one, before any hire exists to measure.
  const [openReqs] = await db.execute<{ open: number; median_age_days: number | null; oldest_days: number | null }>(sql`
    SELECT
      count(*)::int AS open,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (now() - j.requisition_approved_at)) / 86400
      )::float8 AS median_age_days,
      max(EXTRACT(EPOCH FROM (now() - j.requisition_approved_at)) / 86400)::float8 AS oldest_days
    FROM jobs j
    WHERE j.status = 'open'
      AND j.requisition_approved_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM candidate_stage_events e
        JOIN candidates c ON c.id = e.candidate_id
        WHERE c.job_id = j.id AND e.to_stage = 'hired'
      )
  `);

  // How long candidates sit in each stage before moving on. Only completed spells count —
  // an open-ended current stage has no duration yet and would skew the average down.
  const timeInStage = await db.execute<{ stage: string; median_days: number | null; moves: number }>(sql`
    WITH spells AS (
      SELECT
        to_stage AS stage,
        lead(created_at) OVER (PARTITION BY candidate_id ORDER BY created_at) - created_at AS dwell
      FROM candidate_stage_events
    )
    SELECT stage,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM dwell) / 86400)::float8 AS median_days,
           count(*)::int AS moves
    FROM spells WHERE dwell IS NOT NULL
    GROUP BY stage ORDER BY stage
  `);

  // Funnel reach: how many candidates ever got to each stage, regardless of where they are
  // now. Counting current occupancy would understate every earlier stage.
  const reached = await db.execute<{ stage: string; candidates: number }>(sql`
    SELECT to_stage AS stage, count(DISTINCT candidate_id)::int AS candidates
    FROM candidate_stage_events
    WHERE to_stage IN ('new','shortlisted','interviewing','offer','hired')
    GROUP BY to_stage
  `);

  /*
   * Step conversion, counted as "of the people who reached stage A, how many went on to reach
   * stage B" — the intersection, not a ratio of the two totals.
   *
   * The ratio is wrong because candidates skip stages: someone moved straight from
   * interviewing to offer is counted in 'offer' but never in 'shortlisted', which produced
   * conversions above 100% (an observed "Offered 2 · 200%"). An intersection cannot exceed
   * the size of either side, so the number is always a real percentage.
   */
  const steps = await db.execute<{ from_stage: string; to_stage: string; n: number }>(sql`
    WITH reach AS (
      SELECT DISTINCT candidate_id, to_stage
      FROM candidate_stage_events
      WHERE to_stage IN ('new','shortlisted','interviewing','offer','hired')
    )
    SELECT a.to_stage AS from_stage, b.to_stage AS to_stage, count(*)::int AS n
    FROM reach a JOIN reach b USING (candidate_id)
    WHERE (a.to_stage, b.to_stage) IN (
      ('new','shortlisted'), ('shortlisted','interviewing'),
      ('interviewing','offer'), ('offer','hired')
    )
    GROUP BY a.to_stage, b.to_stage
  `);

  // Why we lose people, split by who ended it — withdrawals must not be counted as our
  // rejections (see the note on the disposition taxonomy in schema.ts).
  const exitRows = await db.execute<{ reason: string | null; n: number }>(sql`
    SELECT reason, count(*)::int AS n
    FROM candidate_stage_events
    WHERE to_stage = 'rejected'
    GROUP BY reason
    ORDER BY n DESC
  `);

  // The category is attached here rather than in the client, because the taxonomy that defines
  // it lives in this package — a client-side copy that drifted by a word would split a bucket.
  const exitReasons = exitRows.map((r) => ({
    reason: r.reason,
    n: r.n,
    category: r.reason ? dispositionCategoryFor(r.reason) : null,
  }));

  const [offerStats] = await db.execute<{
    extended: number;
    accepted: number;
    declined: number;
    outstanding: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE extended_at IS NOT NULL)::int AS extended,
      count(*) FILTER (WHERE status = 'accepted')::int AS accepted,
      count(*) FILTER (WHERE status = 'declined')::int AS declined,
      count(*) FILTER (WHERE status = 'extended')::int AS outstanding
    FROM offers
  `);

  const answered = (offerStats?.accepted ?? 0) + (offerStats?.declined ?? 0);

  res.json({
    timeToHire: {
      hires: hireTime?.hires ?? 0,
      medianDays: hireTime?.median_days ?? null,
      avgDays: hireTime?.avg_days ?? null,
    },
    timeToFill: {
      filled: fillTime?.filled ?? 0,
      medianDays: fillTime?.median_days ?? null,
      avgDays: fillTime?.avg_days ?? null,
    },
    openRequisitions: {
      open: openReqs?.open ?? 0,
      medianAgeDays: openReqs?.median_age_days ?? null,
      oldestDays: openReqs?.oldest_days ?? null,
    },
    timeInStage,
    funnel: reached,
    steps,
    exitReasons,
    offers: {
      ...(offerStats ?? { extended: 0, accepted: 0, declined: 0, outstanding: 0 }),
      // Share of answered offers that were accepted — undefined until one is answered,
      // rather than reporting a misleading 0%.
      acceptanceRate: answered > 0 ? Math.round(((offerStats?.accepted ?? 0) / answered) * 100) : null,
    },
  });
});
