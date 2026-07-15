import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// --- Quiz -------------------------------------------------------------------

export const quizOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(500),
});

export const quizQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['single', 'multiple', 'short']),
    prompt: z.string().min(1).max(2000),
    points: z.number().int().min(1).max(100).default(1),
    options: z.array(quizOptionSchema).max(10).optional(),
    correctOptionIds: z.array(z.string()).optional(),
    rubric: z.string().max(2000).nullable().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'single' || q.type === 'multiple') {
      if (!q.options || q.options.length < 2) {
        ctx.addIssue({ code: 'custom', message: 'Choice questions need at least 2 options' });
      }
      const correct = q.correctOptionIds ?? [];
      if (correct.length < 1) {
        ctx.addIssue({ code: 'custom', message: 'Mark at least one correct option' });
      }
      if (q.type === 'single' && correct.length > 1) {
        ctx.addIssue({ code: 'custom', message: 'Single-choice allows only one correct option' });
      }
    }
  });

export const quizAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).optional(),
  text: z.string().max(5000).optional(),
});

export const createJobSchema = z.object({
  title: z.string().min(2).max(255),
  department: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  employmentType: z.string().max(100).optional(),
  description: z.string().min(10),
  requiredSkills: z.array(z.string().min(1)).default([]),
  niceToHaveSkills: z.array(z.string().min(1)).default([]),
  minYearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  educationRequirement: z.string().max(2000).nullable().optional(),
  quiz: z.array(quizQuestionSchema).max(30).default([]),
  status: z.enum(['open', 'closed', 'draft']).default('open'),
});

export const updateJobSchema = createJobSchema.partial();

export const generateQuizSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().min(10),
  requiredSkills: z.array(z.string().min(1)).optional(),
  niceToHaveSkills: z.array(z.string().min(1)).optional(),
  minYearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  educationRequirement: z.string().max(2000).nullable().optional(),
  count: z.number().int().min(1).max(15).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

export const applicationSchema = z.object({
  jobId: z.string().uuid(),
  fullName: z.string().min(2).max(255),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  source: z.string().max(100).optional(),
  quizAnswers: z.array(quizAnswerSchema).max(30).optional(),
});

export const updateStageSchema = z.object({
  stage: z.enum(['new', 'shortlisted', 'rejected', 'interviewing', 'hired']),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
