import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { client, db } from '../db/client.js';
import { candidates, jobs, type QuizQuestion } from '../db/schema.js';
import { createJobSchema, generateQuizSchema, updateJobSchema } from '../lib/validation.js';
import { notFound, serverError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { generateQuiz } from '../services/gemini.js';
import { recordAudit } from '../services/audit.js';
import { recomputeJobScores } from '../services/scoring.js';
import {
  candidateProfileText,
  cosineSim,
  embedText,
  jobProfileText,
  storeEmbedding,
} from '../services/embedding.js';

export const jobsRouter = Router();

/** Strips correct answers and rubrics before sending a quiz to applicants. */
function sanitizeQuizForApplicant(quiz: QuizQuestion[]) {
  return (quiz ?? []).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    options: q.options?.map((o) => ({ id: o.id, text: o.text })),
  }));
}

// --- Public: list open jobs (used by the candidate application form) ---------
jobsRouter.get('/public', async (_req, res) => {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
      employmentType: jobs.employmentType,
      description: jobs.description,
      requiredSkills: jobs.requiredSkills,
      niceToHaveSkills: jobs.niceToHaveSkills,
      quizCount: sql<number>`coalesce(jsonb_array_length(${jobs.quiz}), 0)`,
    })
    .from(jobs)
    .where(eq(jobs.status, 'open'))
    .orderBy(desc(jobs.createdAt));
  res.json({ jobs: rows });
});

jobsRouter.get('/public/:id', async (req, res) => {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, req.params.id), eq(jobs.status, 'open')))
    .limit(1);
  if (!job) throw notFound('Job not found or not open');
  // Never expose correct answers/rubrics to applicants.
  const { quiz, ...rest } = job;
  res.json({ job: { ...rest, quiz: sanitizeQuizForApplicant(quiz) } });
});

// --- Everything below requires HR authentication ----------------------------
jobsRouter.use(requireAuth);

// Talent-pool re-matching: rank candidates who applied to OTHER roles by semantic
// fit to this job (embedding cosine similarity). Lets HR reuse past applicants.
jobsRouter.get('/:id/talent-pool', async (req, res) => {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
  if (!job) throw notFound('Job not found');

  const jobVec = await embedText(jobProfileText(job), 'query');
  if (!jobVec) throw serverError('Could not analyze this job for matching. Try again.');

  type PoolRow = {
    id: string;
    fullName: string;
    email: string;
    jobId: string;
    jobTitle: string | null;
    overallScore: number | null;
    qualificationScore: number | null;
    stage: string;
    embedding: number[] | null;
    cvText: string | null;
    summary: string | null;
    extractedSkills: string[] | null;
    currentTitle: string | null;
  };

  const rows = (await client`
    SELECT c.id, c.full_name AS "fullName", c.email, c.job_id AS "jobId",
           c.overall_score AS "overallScore", c.qualification_score AS "qualificationScore",
           c.stage, c.embedding, c.cv_text AS "cvText", c.summary,
           c.extracted_skills AS "extractedSkills", c.current_title AS "currentTitle",
           j.title AS "jobTitle"
    FROM candidates c
    LEFT JOIN jobs j ON j.id = c.job_id
    WHERE c.job_id <> ${job.id}
  `) as unknown as PoolRow[];

  // Lazy backfill: embed up to 20 candidates that don't have a vector yet.
  for (const r of rows.filter((x) => !x.embedding).slice(0, 20)) {
    const vec = await embedText(candidateProfileText(r), 'document');
    if (vec) {
      r.embedding = vec;
      await storeEmbedding(r.id, vec);
    }
  }

  const limit = Math.min(Number(req.query.limit) || 10, 25);
  const matches = rows
    .filter((r) => r.embedding && r.embedding.length)
    .map((r) => ({
      id: r.id,
      fullName: r.fullName,
      email: r.email,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      overallScore: r.overallScore,
      qualificationScore: r.qualificationScore,
      stage: r.stage,
      similarity: Math.round(cosineSim(jobVec, r.embedding as number[]) * 100),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  res.json({ matches });
});

// Generate a position-specific screening quiz with AI from draft job details.
jobsRouter.post('/generate-quiz', async (req, res) => {
  const input = generateQuizSchema.parse(req.body);
  const quiz = await generateQuiz(
    {
      title: input.title,
      description: input.description,
      requiredSkills: input.requiredSkills,
      niceToHaveSkills: input.niceToHaveSkills,
      minYearsExperience: input.minYearsExperience ?? null,
      educationRequirement: input.educationRequirement ?? null,
    },
    { count: input.count, difficulty: input.difficulty },
  );
  res.json({ quiz });
});

jobsRouter.get('/', async (_req, res) => {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
      employmentType: jobs.employmentType,
      status: jobs.status,
      minYearsExperience: jobs.minYearsExperience,
      requiredSkills: jobs.requiredSkills,
      createdAt: jobs.createdAt,
      candidateCount: sql<number>`cast(count(${candidates.id}) as int)`,
    })
    .from(jobs)
    .leftJoin(candidates, eq(candidates.jobId, jobs.id))
    .groupBy(jobs.id)
    .orderBy(desc(jobs.createdAt));
  res.json({ jobs: rows });
});

jobsRouter.get('/:id', async (req, res) => {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
  if (!job) throw notFound('Job not found');
  res.json({ job });
});

jobsRouter.post('/', async (req, res) => {
  const input = createJobSchema.parse(req.body);
  const [job] = await db
    .insert(jobs)
    .values({ ...input, createdBy: req.user!.sub })
    .returning();
  res.status(201).json({ job });
});

jobsRouter.put('/:id', async (req, res) => {
  const input = updateJobSchema.parse(req.body);
  const [job] = await db
    .update(jobs)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(jobs.id, req.params.id))
    .returning();
  if (!job) throw notFound('Job not found');

  // When ranking weights change, instantly re-rank existing candidates from their
  // stored component scores — no re-analysis / AI calls needed.
  if (input.scoringWeights) {
    await recomputeJobScores(job);
  }

  res.json({ job });
});

jobsRouter.delete('/:id', async (req, res) => {
  const [job] = await db.delete(jobs).where(eq(jobs.id, req.params.id)).returning();
  if (!job) throw notFound('Job not found');
  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'job.delete',
    targetType: 'job',
    targetId: job.id,
    detail: `Deleted "${job.title}"`,
    ip: req.ip ?? null,
  });
  res.status(204).end();
});
