import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  candidates,
  candidateNotes,
  candidateStageEvents,
  jobs,
  emailLogs,
  REJECTION_REASONS,
} from '../db/schema.js';
import { createNoteSchema, rankCandidatesSchema, updateStageSchema } from '../lib/validation.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  idNoteParams,
  idParams,
  optionalQueryString,
  validate,
} from '../middleware/validate.js';
import { deleteCvFile, getCvSource, saveCvFile } from '../services/storage.js';
import { detectCvKind, extractCvText } from '../services/cvParser.js';
import {
  extractCvDetails,
  generateInterviewQuestions,
  rankCandidatesForJob,
} from '../services/gemini.js';
import { runAnalysis } from '../services/analysis.js';
import { recordAudit } from '../services/audit.js';
import { sendApplicationReceived, sendStatusUpdate } from '../services/email.js';
import type { StageKey } from '../lib/applicantStatus.js';
import { logger } from '../lib/logger.js';

export const candidatesRouter = Router();

candidatesRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (detectCvKind(file.mimetype, file.originalname)) cb(null, true);
    else cb(badRequest('Only PDF or DOCX files are accepted.'));
  },
});

/**
 * Bulk import: an HR user uploads a CV directly (one per request; the client loops
 * over a batch). Contact details are extracted from the CV itself, then the candidate
 * is created and AI-analyzed against the job — same pipeline as a public application.
 * POST /api/candidates/import  (multipart: cv file + jobId)
 */
const importCvBody = z.object({ jobId: z.string().uuid('A valid job must be selected.') });

candidatesRouter.post('/import', upload.single('cv'), async (req, res) => {
  if (!req.file) throw badRequest('A CV file (field name "cv") is required.');
  const { jobId } = importCvBody.parse(req.body);

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) throw notFound('Job not found');

  // Extract text first so we fail fast on unreadable files.
  const cvText = await extractCvText(req.file.buffer, req.file.mimetype, req.file.originalname);
  const details = await extractCvDetails(cvText);
  const { storagePath, filename } = await saveCvFile(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
  );

  const baseName = req.file.originalname.replace(/\.[^.]+$/, '').trim();
  const fullName = details.fullName?.trim() || baseName || 'Unknown candidate';
  const email =
    details.email?.trim().toLowerCase() || `no-email-${randomUUID().slice(0, 8)}@import.local`;

  const [candidate] = await db
    .insert(candidates)
    .values({
      jobId: job.id,
      fullName,
      email,
      phone: details.phone ?? null,
      location: details.location ?? null,
      currentTitle: details.currentTitle ?? null,
      declaredYearsExperience: details.yearsExperience ?? null,
      linkedinUrl: details.linkedinUrl ?? null,
      portfolioUrl: details.portfolioUrl ?? null,
      source: 'manual',
      cvFilename: filename,
      cvStoragePath: storagePath,
      cvText,
      analysisStatus: 'processing',
    })
    .returning();
  if (!candidate) throw new Error('Failed to create candidate');

  await db.insert(candidateStageEvents).values({ candidateId: candidate.id, toStage: 'new' });

  await runAnalysis(candidate.id, job, cvText, []);

  const [updated] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidate.id))
    .limit(1);
  res.status(201).json({ candidate: updated });
});

/**
 * AI re-rank a shortlist against a role. Re-analyzes the selected candidates with the
 * LLM and orders them by fit to the position (the first candidate's job).
 * POST /api/candidates/rank  { candidateIds: string[] }
 */
candidatesRouter.post('/rank', async (req, res) => {
  const { candidateIds } = rankCandidatesSchema.parse(req.body);

  const rows = await db.select().from(candidates).where(inArray(candidates.id, candidateIds));
  if (rows.length < 2) throw badRequest('Select at least 2 candidates to rank.');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, rows[0]!.jobId)).limit(1);
  if (!job) throw notFound('Job not found for these candidates.');

  const ranking = await rankCandidatesForJob(
    job,
    rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      currentTitle: r.currentTitle,
      totalYearsExperience: r.totalYearsExperience,
      skills: r.extractedSkills,
      summary: r.summary,
      cvText: r.cvText,
    })),
  );

  res.json({ jobTitle: job.title, ranking });
});

/**
 * List candidates, optionally filtered by job/stage/source, ranked by overall score.
 * GET /api/candidates?jobId=...&stage=...&source=...
 */
const listQuery = z.object({
  jobId: z.string().uuid().optional(),
  stage: z.enum(['new', 'shortlisted', 'rejected', 'interviewing', 'offer', 'hired']).optional(),
  source: optionalQueryString(100),
});

candidatesRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { jobId, stage, source } = req.query as unknown as z.infer<typeof listQuery>;

  const filters = [];
  if (jobId) filters.push(eq(candidates.jobId, jobId));
  if (stage) filters.push(eq(candidates.stage, stage));
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
      experienceScore: candidates.experienceScore,
      educationScore: candidates.educationScore,
      quizScore: candidates.quizScore,
      overallScore: candidates.overallScore,
      aiLikelihood: candidates.aiLikelihood,
      aiVerdict: candidates.aiVerdict,
      recommendation: candidates.recommendation,
      summary: candidates.summary,
      totalYearsExperience: candidates.totalYearsExperience,
      extractedSkills: candidates.extractedSkills,
      stage: candidates.stage,
      analysisStatus: candidates.analysisStatus,
      createdAt: candidates.createdAt,
      // Earliest upcoming scheduled interview for this candidate (null if none).
      nextInterviewAt: sql<string | null>`(
        SELECT min(i.scheduled_at) FROM interviews i
        WHERE i.candidate_id = ${candidates.id}
          AND i.status = 'scheduled'
          AND i.scheduled_at >= now()
      )`,
      // Human scorecard: average recruiter rating (1-5) + how many ratings.
      humanScore: sql<number | null>`(
        SELECT round(avg(n.rating)::numeric, 1)::float8 FROM candidate_notes n
        WHERE n.candidate_id = ${candidates.id} AND n.rating IS NOT NULL
      )`,
      ratingCount: sql<number>`(
        SELECT count(*)::int FROM candidate_notes n
        WHERE n.candidate_id = ${candidates.id} AND n.rating IS NOT NULL
      )`,
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

/**
 * The disposition taxonomy the reason picker is built from. Served rather than duplicated in
 * the client, because the exit-reason metrics group by these exact labels — a client-side copy
 * that drifted by one word would silently split a category in the reporting.
 *
 * Declared before `/:id` so "rejection-reasons" is not read as a candidate id.
 */
candidatesRouter.get('/rejection-reasons', (_req, res) => {
  res.json({ reasons: REJECTION_REASONS });
});

candidatesRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1);

  // Duplicate / re-application detection: other candidate records with the same email.
  const duplicates = await db
    .select({
      id: candidates.id,
      jobId: candidates.jobId,
      jobTitle: jobs.title,
      stage: candidates.stage,
      overallScore: candidates.overallScore,
      qualificationScore: candidates.qualificationScore,
      createdAt: candidates.createdAt,
    })
    .from(candidates)
    .leftJoin(jobs, eq(jobs.id, candidates.jobId))
    .where(
      and(
        sql`lower(${candidates.email}) = lower(${candidate.email})`,
        ne(candidates.id, candidate.id),
      ),
    )
    .orderBy(desc(candidates.createdAt));

  res.json({ candidate, job: job ?? null, duplicates });
});

candidatesRouter.patch('/:id/stage', validate({ params: idParams }), async (req, res) => {
  const { stage, reason } = updateStageSchema.parse(req.body);

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
  // 'offer' included because the stage chips on the candidate page can move someone here
  // directly, without going through the offer card — and the applicant-facing copy for this
  // stage tells them to check their email.
  const NOTIFY_STAGES = ['shortlisted', 'interviewing', 'offer', 'hired', 'rejected'] as const;
  // Awaited, and the result returned, rather than fired and forgotten. A rejection or an
  // offer that never reaches the candidate is exactly the kind of failure a recruiter has to
  // know about, and the old `void` meant the response said success either way.
  let email: Awaited<ReturnType<typeof sendStatusUpdate>> | undefined;
  if (
    stage !== existing.stage &&
    (NOTIFY_STAGES as readonly string[]).includes(stage)
  ) {
    const [job] = await db
      .select({ title: jobs.title })
      .from(jobs)
      .where(eq(jobs.id, candidate.jobId))
      .limit(1);
    email = await sendStatusUpdate(
      candidate.id,
      candidate.email,
      candidate.fullName,
      job?.title ?? 'the role',
      stage,
      candidate.trackingToken,
    ).catch((err) => {
      logger.error({ err }, 'status email failed');
      return { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
    });
  }

  if (stage !== existing.stage) {
    // Structured history — the audit log is for humans, this is what the funnel and
    // time-to-hire metrics are computed from. Awaited so a failure surfaces rather than
    // silently leaving a hole in the timeline.
    await db.insert(candidateStageEvents).values({
      candidateId: candidate.id,
      fromStage: existing.stage,
      toStage: stage,
      reason: reason || null,
      changedBy: req.user?.sub ?? null,
    });

    void recordAudit({
      actorEmail: req.user?.email ?? null,
      action: 'candidate.stage_change',
      targetType: 'candidate',
      targetId: candidate.id,
      detail: `${candidate.fullName}: ${existing.stage} → ${stage}${reason ? ` (${reason})` : ''}`,
      ip: req.ip ?? null,
    });
  }

  res.json({ candidate, email });
});

// --- Candidate notes & human scorecards ------------------------------------

/** List a candidate's notes + the aggregated human score (avg 1-5 rating). */
candidatesRouter.get('/:id/notes', validate({ params: idParams }), async (req, res) => {
  const notes = await db
    .select()
    .from(candidateNotes)
    .where(eq(candidateNotes.candidateId, req.params.id))
    .orderBy(desc(candidateNotes.createdAt));

  const ratings = notes.map((n) => n.rating).filter((r): r is number => r != null);
  const humanScore = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  res.json({ notes, humanScore, ratingCount: ratings.length });
});

/** Add a note and/or a 1-5 scorecard rating for a candidate. */
candidatesRouter.post('/:id/notes', validate({ params: idParams }), async (req, res) => {
  const input = createNoteSchema.parse(req.body);

  const [candidate] = await db
    .select({ id: candidates.id, fullName: candidates.fullName })
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const [note] = await db
    .insert(candidateNotes)
    .values({
      candidateId: candidate.id,
      authorId: req.user!.sub,
      authorName: req.user!.name ?? req.user!.email ?? null,
      rating: input.rating ?? null,
      body: input.body?.trim() || null,
    })
    .returning();

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'candidate.note_add',
    targetType: 'candidate',
    targetId: candidate.id,
    detail: `${input.rating ? `Rated ${input.rating}/5` : 'Added a note'} for ${candidate.fullName}`,
    ip: req.ip ?? null,
  });

  res.status(201).json({ note });
});

/** Delete a note — allowed for its author or an admin. */
candidatesRouter.delete('/:id/notes/:noteId', validate({ params: idNoteParams }), async (req, res) => {
  const [note] = await db
    .select()
    .from(candidateNotes)
    .where(eq(candidateNotes.id, req.params.noteId))
    .limit(1);
  if (!note || note.candidateId !== req.params.id) throw notFound('Note not found');
  if (note.authorId !== req.user!.sub && req.user!.role !== 'admin') {
    throw forbidden('You can only delete your own notes.');
  }

  await db.delete(candidateNotes).where(eq(candidateNotes.id, note.id));
  res.json({ ok: true });
});

// GDPR: return everything held about a candidate (feeds the readable data-export page;
// the client also offers the raw JSON download for data portability).
// GDPR: erase a candidate on request (removes the row + stored CV).
candidatesRouter.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
  const [candidate] = await db
    .select({ id: candidates.id, fullName: candidates.fullName, cvStoragePath: candidates.cvStoragePath })
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  await deleteCvFile(candidate.cvStoragePath);
  await db.delete(candidates).where(eq(candidates.id, candidate.id));

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'candidate.delete',
    targetType: 'candidate',
    targetId: candidate.id,
    detail: `Deleted ${candidate.fullName}`,
    ip: req.ip ?? null,
  });

  res.json({ ok: true });
});

// List the notification emails sent to this candidate.
candidatesRouter.get('/:id/emails', validate({ params: idParams }), async (req, res) => {
  const rows = await db
    .select()
    .from(emailLogs)
    .where(eq(emailLogs.candidateId, req.params.id))
    .orderBy(desc(emailLogs.createdAt));
  res.json({ emails: rows });
});

const resendBody = z.object({ type: z.enum(['confirmation', 'status']) });

// Manually (re)send the confirmation or the current-status email to the applicant.
candidatesRouter.post('/:id/resend', validate({ params: idParams, body: resendBody }), async (req, res) => {
  const kind = (req.body as z.infer<typeof resendBody>).type;

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

// Generate (or regenerate) tailored interview questions for a candidate and store them.
candidatesRouter.post('/:id/interview-questions', validate({ params: idParams }), async (req, res) => {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1);
  if (!job) throw notFound('Associated job not found');

  const questions = await generateInterviewQuestions({
    job,
    fullName: candidate.fullName,
    currentTitle: candidate.currentTitle,
    summary: candidate.summary,
    strengths: candidate.strengths,
    concerns: candidate.concerns,
    skills: candidate.extractedSkills,
    totalYearsExperience: candidate.totalYearsExperience,
  });

  const [updated] = await db
    .update(candidates)
    .set({ interviewQuestions: questions, updatedAt: new Date() })
    .where(eq(candidates.id, candidate.id))
    .returning();

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'candidate.interview_questions',
    targetType: 'candidate',
    targetId: candidate.id,
    detail: `Generated ${questions.length} interview questions for ${candidate.fullName}`,
    ip: req.ip ?? null,
  });

  res.json({ candidate: updated });
});

candidatesRouter.post('/:id/reanalyze', validate({ params: idParams }), async (req, res) => {
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

candidatesRouter.get('/:id/cv', validate({ params: idParams }), async (req, res) => {
  const [candidate] = await db
    .select({ path: candidates.cvStoragePath, filename: candidates.cvFilename })
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate || !candidate.path) throw notFound('CV file not found');

  const source = await getCvSource(candidate.path, candidate.filename ?? 'cv');
  if (!source) throw notFound('CV file is no longer available');

  if (source.kind === 'redirect') {
    res.redirect(source.url);
    return;
  }
  res.download(source.absPath, candidate.filename ?? 'cv');
});
