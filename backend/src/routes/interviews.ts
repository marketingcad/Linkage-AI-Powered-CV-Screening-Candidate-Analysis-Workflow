import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, interviews, jobs } from '../db/schema.js';
import { createInterviewSchema, updateInterviewSchema } from '../lib/validation.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { idParams, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.js';
import { sendCandidateInterviewEmail, type CandidateInterviewKind } from '../services/email.js';
import { liveKitEnabled } from '../config/env.js';
import { buildJoinLink, signJoinToken } from '../services/aiInterview.js';
import { logger } from '../lib/logger.js';
import { getHolidays, holidayCountry } from '../services/holidays.js';

export const interviewsRouter = Router();

interviewsRouter.use(requireAuth);

const holidaysQuery = z.object({
  year: z.coerce.number().int().min(1970).max(2100),
});

/**
 * Public holidays for the calendar year. Answers with an empty list rather than an error if
 * the upstream dataset is unreachable — the calendar works fine without them.
 */
interviewsRouter.get('/holidays', validate({ query: holidaysQuery }), async (req, res) => {
  const { year } = req.query as unknown as z.infer<typeof holidaysQuery>;
  res.json({ country: holidayCountry(), holidays: await getHolidays(year) });
});

/** Interview row enriched with candidate + job info for the calendar UI. */
const selection = {
  id: interviews.id,
  candidateId: interviews.candidateId,
  jobId: interviews.jobId,
  title: interviews.title,
  scheduledAt: interviews.scheduledAt,
  durationMinutes: interviews.durationMinutes,
  mode: interviews.mode,
  location: interviews.location,
  notes: interviews.notes,
  reminderMinutes: interviews.reminderMinutes,
  reminderSent: interviews.reminderSent,
  status: interviews.status,
  createdAt: interviews.createdAt,
  updatedAt: interviews.updatedAt,
  candidateName: candidates.fullName,
  candidateEmail: candidates.email,
  candidateStage: candidates.stage,
  candidateTimezone: candidates.timezone,
  jobTitle: jobs.title,
};

function withJoins() {
  return db
    .select(selection)
    .from(interviews)
    .leftJoin(candidates, eq(candidates.id, interviews.candidateId))
    .leftJoin(jobs, eq(jobs.id, interviews.jobId));
}

async function findOne(id: string) {
  const [row] = await withJoins().where(eq(interviews.id, id)).limit(1);
  return row;
}

type JoinedInterview = NonNullable<Awaited<ReturnType<typeof findOne>>>;

/**
 * For ai_voice interviews, store the candidate join link in `location` so the invite email +
 * calendar carry it. The token encodes the time window, so this must run again on reschedule.
 */
async function refreshAiVoiceLink(interviewId: string): Promise<void> {
  if (!liveKitEnabled) return;
  const [row] = await db
    .select({
      id: interviews.id,
      mode: interviews.mode,
      candidateId: interviews.candidateId,
      candidateName: candidates.fullName,
      scheduledAt: interviews.scheduledAt,
      durationMinutes: interviews.durationMinutes,
    })
    .from(interviews)
    .leftJoin(candidates, eq(candidates.id, interviews.candidateId))
    .where(eq(interviews.id, interviewId))
    .limit(1);
  if (!row || row.mode !== 'ai_voice') return;

  const link = buildJoinLink(
    signJoinToken({
      interviewId: row.id,
      candidateId: row.candidateId,
      candidateName: row.candidateName ?? 'Candidate',
      scheduledAt: row.scheduledAt.toISOString(),
      durationMinutes: row.durationMinutes,
    }),
  );
  await db.update(interviews).set({ location: link }).where(eq(interviews.id, interviewId));
}

/** Email the candidate about their interview (invite / reschedule / cancel). Never throws. */
async function emailCandidate(row: JoinedInterview, kind: CandidateInterviewKind) {
  if (!row.candidateEmail) return undefined;
  try {
    return await sendCandidateInterviewEmail(row.candidateEmail, kind, {
      interviewId: row.id,
      candidateId: row.candidateId,
      candidateName: row.candidateName ?? 'Candidate',
      jobTitle: row.jobTitle,
      start: new Date(row.scheduledAt),
      durationMinutes: row.durationMinutes,
      mode: row.mode,
      location: row.location,
      timezone: row.candidateTimezone,
      sequence: kind === 'invite' ? 0 : 1,
    });
  } catch (err) {
    logger.error({ err }, 'candidate interview email failed');
    return { sent: false, error: 'send failed' };
  }
}

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(['scheduled', 'completed', 'canceled', 'no_show']).optional(),
  candidateId: z.string().uuid().optional(),
});

// List interviews, optionally within a [from, to] date range.
interviewsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { from, to, status, candidateId } = req.query as unknown as z.infer<typeof listQuery>;
  const filters = [];
  if (from) filters.push(gte(interviews.scheduledAt, from));
  if (to) filters.push(lte(interviews.scheduledAt, to));
  if (status) filters.push(eq(interviews.status, status));
  if (candidateId) filters.push(eq(interviews.candidateId, candidateId));

  const rows = await withJoins()
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(interviews.scheduledAt));
  res.json({ interviews: rows });
});

interviewsRouter.post('/', async (req, res) => {
  const input = createInterviewSchema.parse(req.body);

  const [candidate] = await db
    .select({ id: candidates.id, jobId: candidates.jobId, fullName: candidates.fullName })
    .from(candidates)
    .where(eq(candidates.id, input.candidateId))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const [created] = await db
    .insert(interviews)
    .values({
      candidateId: candidate.id,
      jobId: candidate.jobId,
      createdBy: req.user!.sub,
      title: input.title ?? null,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      mode: input.mode,
      location: input.location ?? null,
      notes: input.notes ?? null,
      reminderMinutes: input.reminderMinutes,
    })
    .returning({ id: interviews.id });
  if (!created) throw new Error('Failed to create interview');

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'interview.create',
    targetType: 'candidate',
    targetId: candidate.id,
    detail: `Scheduled interview with ${candidate.fullName} for ${input.scheduledAt.toISOString()}`,
    ip: req.ip ?? null,
  });

  // ai_voice: generate the candidate join link into `location` before the invite goes out.
  if (input.mode === 'ai_voice') await refreshAiVoiceLink(created.id);

  const row = await findOne(created.id);
  const email = input.notifyCandidate !== false && row ? await emailCandidate(row, 'invite') : undefined;

  res.status(201).json({ interview: row, email });
});

interviewsRouter.patch('/:id', validate({ params: idParams }), async (req, res) => {
  const input = updateInterviewSchema.parse(req.body);
  // notifyCandidate is a control flag, not a column — keep it out of the DB update.
  const { notifyCandidate, ...updateFields } = input;

  const [existing] = await db
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      status: interviews.status,
    })
    .from(interviews)
    .where(eq(interviews.id, req.params.id))
    .limit(1);
  if (!existing) throw notFound('Interview not found');

  // Rescheduling to a new time re-arms the reminder.
  const rescheduled =
    input.scheduledAt != null && input.scheduledAt.getTime() !== existing.scheduledAt.getTime();

  const [updated] = await db
    .update(interviews)
    .set({
      ...updateFields,
      ...(rescheduled ? { reminderSent: false } : {}),
      updatedAt: new Date(),
    })
    .where(eq(interviews.id, req.params.id))
    .returning({ id: interviews.id });
  if (!updated) throw notFound('Interview not found');

  // Reschedule / duration change / switch to ai_voice → regenerate the time-gated join link.
  if (rescheduled || input.durationMinutes != null || input.mode === 'ai_voice') {
    await refreshAiVoiceLink(updated.id);
  }

  const row = await findOne(updated.id);

  // Notify the candidate on a reschedule or a cancellation (not on minor edits).
  let kind: CandidateInterviewKind | null = null;
  if (input.status === 'canceled' && existing.status !== 'canceled') kind = 'canceled';
  else if (rescheduled) kind = 'updated';

  const email =
    notifyCandidate !== false && kind && row ? await emailCandidate(row, kind) : undefined;

  res.json({ interview: row, email });
});

interviewsRouter.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const [deleted] = await db
    .delete(interviews)
    .where(eq(interviews.id, req.params.id))
    .returning({ id: interviews.id, candidateId: interviews.candidateId });
  if (!deleted) throw notFound('Interview not found');

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'interview.delete',
    targetType: 'candidate',
    targetId: deleted.candidateId,
    detail: 'Removed a scheduled interview',
    ip: req.ip ?? null,
  });

  res.json({ ok: true });
});
