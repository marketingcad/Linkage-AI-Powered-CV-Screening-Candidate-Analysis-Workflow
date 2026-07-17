import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, jobs, emailLogs } from '../db/schema.js';
import { rankCandidatesSchema, updateStageSchema } from '../lib/validation.js';
import { badRequest, notFound } from '../lib/errors.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { deleteCvFile, getCvSource, saveCvFile } from '../services/storage.js';
import { detectCvKind, extractCvText } from '../services/cvParser.js';
import { extractCvDetails, rankCandidatesForJob } from '../services/gemini.js';
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
candidatesRouter.post('/import', upload.single('cv'), async (req, res) => {
  if (!req.file) throw badRequest('A CV file (field name "cv") is required.');
  const jobId = typeof req.body.jobId === 'string' ? req.body.jobId : '';
  if (!jobId) throw badRequest('jobId is required.');

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
      aiLikelihood: candidates.aiLikelihood,
      aiVerdict: candidates.aiVerdict,
      recommendation: candidates.recommendation,
      summary: candidates.summary,
      totalYearsExperience: candidates.totalYearsExperience,
      extractedSkills: candidates.extractedSkills,
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

  if (stage !== existing.stage) {
    void recordAudit({
      actorEmail: req.user?.email ?? null,
      action: 'candidate.stage_change',
      targetType: 'candidate',
      targetId: candidate.id,
      detail: `${candidate.fullName}: ${existing.stage} → ${stage}`,
      ip: req.ip ?? null,
    });
  }

  res.json({ candidate });
});

// GDPR: return everything held about a candidate (feeds the readable data-export page;
// the client also offers the raw JSON download for data portability).
candidatesRouter.get('/:id/export', async (req, res) => {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, req.params.id))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1);

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'candidate.export',
    targetType: 'candidate',
    targetId: candidate.id,
    detail: `Exported data for ${candidate.fullName}`,
    ip: req.ip ?? null,
  });

  const safe = candidate as Record<string, unknown>;
  delete safe.embedding;
  res.json({ candidate: safe, job: job ?? null, exportedAt: new Date().toISOString() });
});

// GDPR: erase a candidate on request (removes the row + stored CV).
candidatesRouter.delete('/:id', async (req, res) => {
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

  const source = await getCvSource(candidate.path, candidate.filename ?? 'cv');
  if (!source) throw notFound('CV file is no longer available');

  if (source.kind === 'redirect') {
    res.redirect(source.url);
    return;
  }
  res.download(source.absPath, candidate.filename ?? 'cv');
});
