import { Router } from 'express';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, jobs } from '../db/schema.js';
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
