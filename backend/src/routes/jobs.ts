import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, jobs, type QuizQuestion } from '../db/schema.js';
import { createJobSchema, generateQuizSchema, updateJobSchema } from '../lib/validation.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { generateQuiz } from '../services/gemini.js';

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
  res.json({ job });
});

jobsRouter.delete('/:id', async (req, res) => {
  const [job] = await db.delete(jobs).where(eq(jobs.id, req.params.id)).returning();
  if (!job) throw notFound('Job not found');
  res.status(204).end();
});
