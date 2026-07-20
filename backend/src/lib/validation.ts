import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// --- Account / profile ------------------------------------------------------

export const updateProfileSchema = z
  .object({
    name: z.string().min(2).max(255).optional(),
    email: z.string().email().max(255).optional(),
    // Resized avatar as an image data URL, or null to remove it. ~4MB cap.
    avatarUrl: z
      .string()
      .max(4_000_000)
      .refine((v) => v.startsWith('data:image/'), 'avatarUrl must be an image data URL')
      .nullable()
      .optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.email !== undefined || v.avatarUrl !== undefined,
    'Provide at least one field to update',
  );

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

// --- Two-factor (TOTP) auth ---

const codeField = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

export const totpCodeSchema = z.object({ code: codeField });

export const mfaLoginSchema = z.object({
  mfaToken: z.string().min(10),
  code: codeField,
});

export const rankCandidatesSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(2).max(6),
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

// Per-job ranking weights. Each 0-100; normalized at compute time so they need not sum to 100.
export const scoringWeightsSchema = z.object({
  skills: z.number().int().min(0).max(100),
  experience: z.number().int().min(0).max(100),
  education: z.number().int().min(0).max(100),
  quiz: z.number().int().min(0).max(100),
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
  scoringWeights: scoringWeightsSchema.optional(),
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
  location: z.string().max(255).optional(),
  currentTitle: z.string().max(255).optional(),
  declaredYearsExperience: z.coerce.number().int().min(0).max(60).optional(),
  linkedinUrl: z.string().max(512).optional(),
  portfolioUrl: z.string().max(512).optional(),
  noticePeriod: z.string().max(100).optional(),
  expectedSalary: z.string().max(100).optional(),
  coverNote: z.string().max(5000).optional(),
  source: z.string().max(100).optional(),
  quizAnswers: z.array(quizAnswerSchema).max(30).optional(),
});

export const updateStageSchema = z.object({
  stage: z.enum(['new', 'shortlisted', 'rejected', 'interviewing', 'hired']),
});

// --- Interviews / scheduler -------------------------------------------------

export const createInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  title: z.string().max(255).nullable().optional(),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(600).default(45),
  mode: z.enum(['video', 'onsite', 'phone']).default('video'),
  location: z.string().max(1000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  reminderMinutes: z.number().int().min(0).max(10080).default(30),
});

export const updateInterviewSchema = z
  .object({
    title: z.string().max(255).nullable().optional(),
    scheduledAt: z.coerce.date().optional(),
    durationMinutes: z.number().int().min(5).max(600).optional(),
    mode: z.enum(['video', 'onsite', 'phone']).optional(),
    location: z.string().max(1000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    reminderMinutes: z.number().int().min(0).max(10080).optional(),
    status: z.enum(['scheduled', 'completed', 'canceled']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
