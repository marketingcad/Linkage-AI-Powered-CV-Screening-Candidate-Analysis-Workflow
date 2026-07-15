import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { db } from '../db/client.js';
import { candidates, emailLogs, jobs } from '../db/schema.js';
import { updateStageSchema } from '../lib/validation.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveStoragePath } from '../services/storage.js';
import { runAnalysis } from '../services/analysis.js';
import { sendApplicationReceived, sendStatusUpdate } from '../services/email.js';
import type { StageKey } from '../lib/applicantStatus.js';
import { logger } from '../lib/logger.js';

export const candidatesRouter = Router();

candidatesRouter.use(requireAuth);

/**
 * List candidates, optionally filtered by job/stage/source, ranked by overall score.
 * GET /api/candidates?jobId=...&stage=...&source=...
 */
candidatesRouter.get('/', async (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined;
  const source = typeof req.query.source === 'string' ? req.query.source : undefined;

  const filters = [];
  if (jobId) filters.push(eq(candidates.jobId, jobId));
  if (stage) filters.push(eq(candidates.stage, stage as never));
  if (source) filters.push(eq(candidates.source, source));

  const rows = await db
    .select({
      id: candidates.id,
      jobId: candidates.jobId,
      jobTitle: jobs.title,
      fullName: candidates.fullName,
      email: candidates.email,
      phone: candidates.phone,
      source: candidates.source,
      qualificationScore: candidates.qualificationScore,
      skillsMatchScore: candidates.skillsMatchScore,
      quizScore: candidates.quizScore,
      overallScore: candidates.overallScore,
      recommendation: candidates.recommendation,
      summary: candidates.summary,
      totalYearsExperience: candidates.totalYearsExperience,
      stage: candidates.stage,
      analysisStatus: candidates.analysisStatus,
      createdAt: candidates.createdAt,
    })
    .from(candidates)
    .leftJoin(jobs, eq(jobs.id, candidates.jobId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      // Highest combined score first; fall back to CV score; nulls sink to the bottom.
      sql`coalesce(${candidates.overallScore}, ${candidates.qualificationScore}) desc nulls last`,
      desc(candidates.createdAt),
    );

  res.json({ candidates: rows });
});

candidatesRouter.get('/:id', async (req, res) => {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1);

  res.json({ candidate, job: job ?? null });
});

candidatesRouter.patch('/:id/stage', async (req, res) => {
  const { stage } = updateStageSchema.parse(req.body);

  const [existing] = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!existing) throw notFound('Candidate not found');

  const [candidate] = await db
    .update(candidates)
    .set({ stage, updatedAt: new Date() })
    .where(eq(candidates.id, req.params.id))
    .returning();
  if (!candidate) throw notFound('Candidate not found');

  // Notify the applicant when the stage actually changes to a meaningful status.
  const NOTIFY_STAGES = ['shortlisted', 'interviewing', 'hired', 'rejected'] as const;
  if (
    stage !== existing.stage &&
    (NOTIFY_STAGES as readonly string[]).includes(stage)
  ) {
    const [job] = await db
      .select({ title: jobs.title })
      .from(jobs)
      .where(eq(jobs.id, candidate.jobId))
      .limit(1);
    void sendStatusUpdate(
      candidate.id,
      candidate.email,
      candidate.fullName,
      job?.title ?? 'the role',
      stage,
      candidate.trackingToken,
    ).catch((err) => logger.error({ err }, 'status email failed'));
  }

  res.json({ candidate });
});

// List the notification emails sent to this candidate.
candidatesRouter.get('/:id/emails', async (req, res) => {
  const rows = await db
    .select()
    .from(emailLogs)
    .where(eq(emailLogs.candidateId, req.params.id))
    .orderBy(desc(emailLogs.createdAt));
  res.json({ emails: rows });
});

// Manually (re)send the confirmation or the current-status email to the applicant.
candidatesRouter.post('/:id/resend', async (req, res) => {
  const kind = req.body?.type;
  if (kind !== 'confirmation' && kind !== 'status') {
    throw badRequest('type must be "confirmation" or "status".');
  }

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const [job] = await db
    .select({ title: jobs.title })
    .from(jobs)
    .where(eq(jobs.id, candidate.jobId))
    .limit(1);
  const jobTitle = job?.title ?? 'the role';

  const result =
    kind === 'confirmation'
      ? await sendApplicationReceived(
          candidate.id,
          candidate.email,
          candidate.fullName,
          jobTitle,
          candidate.trackingToken,
        )
      : await sendStatusUpdate(
          candidate.id,
          candidate.email,
          candidate.fullName,
          jobTitle,
          candidate.stage as StageKey,
          candidate.trackingToken,
        );

  res.json({ result });
});

candidatesRouter.post('/:id/reanalyze', async (req, res) => {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');
  if (!candidate.cvText) throw badRequest('No CV text stored for this candidate.');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1);
  if (!job) throw notFound('Associated job not found');

  await runAnalysis(candidate.id, job, candidate.cvText, candidate.quizAnswers ?? []);

  const [updated] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidate.id))
    .limit(1);
  res.json({ candidate: updated });
});

candidatesRouter.get('/:id/cv', async (req, res) => {
  const [candidate] = await db
    .select({ path: candidates.cvStoragePath, filename: candidates.cvFilename })
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate || !candidate.path) throw notFound('CV file not found');

  const absPath = resolveStoragePath(candidate.path);
  if (!existsSync(absPath)) throw notFound('CV file is missing on disk');

  res.download(absPath, candidate.filename ?? 'cv');
});
