import { Router } from 'express';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, interviews, jobs } from '../db/schema.js';
import { createInterviewSchema, updateInterviewSchema } from '../lib/validation.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';
import { sendCandidateInterviewEmail, type CandidateInterviewKind } from '../services/email.js';
import { logger } from '../lib/logger.js';

export const interviewsRouter = Router();

interviewsRouter.use(requireAuth);

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

/** Email the candidate about their interview (invite / reschedule / cancel). Never throws. */
async function emailCandidate(row: JoinedInterview, kind: CandidateInterviewKind) {
  if (!row.candidateEmail) return undefined;
  try {
    return await sendCandidateInterviewEmail(row.candidateEmail, kind, {
      interviewId: row.id,
      candidateName: row.candidateName ?? 'Candidate',
      jobTitle: row.jobTitle,
      start: new Date(row.scheduledAt),
      durationMinutes: row.durationMinutes,
      mode: row.mode,
      location: row.location,
      sequence: kind === 'invite' ? 0 : 1,
    });
  } catch (err) {
    logger.error({ err }, 'candidate interview email failed');
    return { sent: false, error: 'send failed' };
  }
}

// List interviews, optionally within a [from, to] date range.
interviewsRouter.get('/', async (req, res) => {
  const filters = [];
  if (typeof req.query.from === 'string') {
    const from = new Date(req.query.from);
    if (!Number.isNaN(from.getTime())) filters.push(gte(interviews.scheduledAt, from));
  }
  if (typeof req.query.to === 'string') {
    const to = new Date(req.query.to);
    if (!Number.isNaN(to.getTime())) filters.push(lte(interviews.scheduledAt, to));
  }
  if (typeof req.query.status === 'string') {
    filters.push(eq(interviews.status, req.query.status));
  }
  if (typeof req.query.candidateId === 'string') {
    filters.push(eq(interviews.candidateId, req.query.candidateId));
  }

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

  const row = await findOne(created.id);
  const email = input.notifyCandidate !== false && row ? await emailCandidate(row, 'invite') : undefined;

  res.status(201).json({ interview: row, email });
});

interviewsRouter.patch('/:id', async (req, res) => {
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

  const row = await findOne(updated.id);

  // Notify the candidate on a reschedule or a cancellation (not on minor edits).
  let kind: CandidateInterviewKind | null = null;
  if (input.status === 'canceled' && existing.status !== 'canceled') kind = 'canceled';
  else if (rescheduled) kind = 'updated';

  const email =
    notifyCandidate !== false && kind && row ? await emailCandidate(row, kind) : undefined;

  res.json({ interview: row, email });
});

interviewsRouter.delete('/:id', async (req, res) => {
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
