import { Router } from 'express';
import multer from 'multer';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, jobs } from '../db/schema.js';
import { applicationSchema } from '../lib/validation.js';
import { badRequest, notFound } from '../lib/errors.js';
import { env } from '../config/env.js';
import { extractCvText } from '../services/cvParser.js';
import { saveCvFile } from '../services/storage.js';
import { runAnalysis } from '../services/analysis.js';
import { sendApplicationReceived } from '../services/email.js';
import { logger } from '../lib/logger.js';
import { APPLICANT_TIMELINE, statusFor } from '../lib/applicantStatus.js';

export const applicationsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});

/**
 * Public endpoint: a candidate submits an application with their CV.
 * The CV is stored, text-extracted, and analyzed by AI before we respond.
 */
applicationsRouter.post('/', upload.single('cv'), async (req, res) => {
  if (!req.file) throw badRequest('A CV file (field name "cv") is required.');

  // quizAnswers arrives as a JSON string over multipart/form-data.
  const body: Record<string, unknown> = { ...req.body };
  if (typeof body.quizAnswers === 'string') {
    try {
      body.quizAnswers = JSON.parse(body.quizAnswers);
    } catch {
      throw badRequest('quizAnswers must be valid JSON.');
    }
  }

  const input = applicationSchema.parse(body);

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .limit(1);
  if (!job) throw notFound('Job not found');
  if (job.status !== 'open') throw badRequest('This job is no longer accepting applications.');

  // Extract text first so we fail fast on unreadable files.
  const cvText = await extractCvText(req.file.buffer, req.file.mimetype, req.file.originalname);
  const { storagePath, filename } = await saveCvFile(req.file.buffer, req.file.originalname);

  const quizAnswers = input.quizAnswers ?? [];

  const [candidate] = await db
    .insert(candidates)
    .values({
      jobId: job.id,
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      source: normalizeSource(input.source),
      cvFilename: filename,
      cvStoragePath: storagePath,
      cvText,
      quizAnswers,
      analysisStatus: 'processing',
    })
    .returning();

  // Run AI analysis (CV + quiz) inline so the applicant gets immediate confirmation.
  await runAnalysis(candidate!.id, job, cvText, quizAnswers);

  // Confirmation email with a status-tracking link (fire-and-forget — never block/fail the request).
  void sendApplicationReceived(
    candidate!.id,
    candidate!.email,
    candidate!.fullName,
    job.title,
    candidate!.trackingToken,
  ).catch((err) => logger.error({ err }, 'confirmation email failed'));

  const [result] = await db
    .select({
      id: candidates.id,
      analysisStatus: candidates.analysisStatus,
      qualificationScore: candidates.qualificationScore,
    })
    .from(candidates)
    .where(eq(candidates.id, candidate!.id))
    .limit(1);

  res.status(201).json({
    message: 'Application received and analyzed.',
    candidateId: result!.id,
    analysisStatus: result!.analysisStatus,
    trackingToken: candidate!.trackingToken,
  });
});

/**
 * Public: an applicant checks their status via the opaque token from their email.
 * Returns status only — never AI scores, evaluations, or other candidates.
 */
applicationsRouter.get('/status/:token', async (req, res) => {
  const [row] = await db
    .select({
      fullName: candidates.fullName,
      stage: candidates.stage,
      createdAt: candidates.createdAt,
      updatedAt: candidates.updatedAt,
      jobTitle: jobs.title,
      jobLocation: jobs.location,
    })
    .from(candidates)
    .leftJoin(jobs, eq(jobs.id, candidates.jobId))
    .where(eq(candidates.trackingToken, req.params.token))
    .limit(1);

  if (!row) throw notFound('Application not found. Please check your tracking link.');

  const status = statusFor(row.stage);
  res.json({
    application: {
      fullName: row.fullName,
      jobTitle: row.jobTitle,
      jobLocation: row.jobLocation,
      submittedAt: row.createdAt,
      updatedAt: row.updatedAt,
      stage: row.stage,
      status,
      timeline: APPLICANT_TIMELINE,
    },
  });
});

/** Normalizes a free-form source tag (e.g. "LinkedIn") to a short, safe slug. */
function normalizeSource(source: string | undefined): string {
  if (!source) return 'direct';
  const slug = source
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return slug || 'direct';
}
