import { z } from 'zod';
import { httpUrl } from '../middleware/validate.js';

export const loginSchema = z.object({
  email: z.string().email(),
  // Bounded so an oversized body can't be pushed through bcrypt.
  password: z.string().min(1).max(200),
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
  mfaToken: z.string().min(10).max(2048),
  code: codeField,
});

// --- Team management (admin only) -------------------------------------------

export const createTeamMemberSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(255),
  email: z.string().email().max(255),
  // Initial password — the teammate can change it after signing in.
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(['admin', 'member']).default('member'),
});

export const updateTeamMemberSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    role: z.enum(['admin', 'member']).optional(),
  })
  .refine((v) => v.name !== undefined || v.role !== undefined, 'Provide a field to update');

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
  // Same reasoning as employmentType below: a fixed list in the UI, a free string on the wire
  // so jobs saved before the list existed stay editable.
  workArrangement: z
    .string()
    .trim()
    .min(1, 'Work arrangement is required.')
    .max(40)
    .optional(),
  // Required, but still a free string rather than an enum: the UI offers a fixed list while
  // jobs created before that list existed keep whatever value they were saved with, and
  // rejecting those would make an old job impossible to edit.
  employmentType: z.string().trim().min(1, 'Employment type is required.').max(100),
  description: z.string().min(10).max(20_000),
  requiredSkills: z.array(z.string().min(1).max(100)).max(50).default([]),
  niceToHaveSkills: z.array(z.string().min(1).max(100)).max(50).default([]),
  minYearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  educationRequirement: z.string().max(2000).nullable().optional(),
  quiz: z.array(quizQuestionSchema).max(30).default([]),
  scoringWeights: scoringWeightsSchema.optional(),
  status: z.enum(['open', 'closed', 'draft']).default('open'),
});

export const updateJobSchema = createJobSchema.partial();

export const generateQuizSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().min(10).max(20_000),
  requiredSkills: z.array(z.string().min(1).max(100)).max(50).optional(),
  niceToHaveSkills: z.array(z.string().min(1).max(100)).max(50).optional(),
  minYearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  educationRequirement: z.string().max(2000).nullable().optional(),
  count: z.number().int().min(1).max(15).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

/** Rewrite an existing job description. Everything but the text is context for the rewrite. */
export const improveDescriptionSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().trim().min(20, 'Write a few sentences first.').max(20_000),
  department: z.string().max(255).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  workArrangement: z.string().max(40).nullable().optional(),
  employmentType: z.string().max(100).nullable().optional(),
  requiredSkills: z.array(z.string().min(1).max(100)).max(50).optional(),
  niceToHaveSkills: z.array(z.string().min(1).max(100)).max(50).optional(),
  minYearsExperience: z.number().int().min(0).max(60).nullable().optional(),
});

export const applicationSchema = z.object({
  jobId: z.string().uuid(),
  fullName: z.string().min(2).max(255),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  location: z.string().max(255).optional(),
  currentTitle: z.string().max(255).optional(),
  declaredYearsExperience: z.coerce.number().int().min(0).max(60).optional(),
  // Rendered as clickable links in the HR dashboard and emails — must be http(s)
  // so `javascript:` / `data:` payloads can't be stored and clicked.
  linkedinUrl: httpUrl(512).optional(),
  portfolioUrl: httpUrl(512).optional(),
  noticePeriod: z.string().max(100).optional(),
  expectedSalary: z.string().max(100).optional(),
  coverNote: z.string().max(5000).optional(),
  source: z.string().max(100).optional(),
  quizAnswers: z.array(quizAnswerSchema).max(30).optional(),
  // Candidate's up-to-3 preferred initial-interview slots (accepts ISO date strings).
  availabilitySlots: z.array(z.coerce.date()).max(3).optional(),
  // Candidate's IANA timezone (e.g. "America/New_York") — the slots above are in it.
  // Validated against the runtime's zone database since it drives email/calendar rendering.
  timezone: z
    .string()
    .max(64)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Must be a valid IANA timezone' },
    )
    .optional(),
});

export const updateStageSchema = z.object({
  stage: z.enum(['new', 'shortlisted', 'rejected', 'interviewing', 'offer', 'hired']),
  /**
   * Why the candidate was moved — recorded on the stage event. Mainly for rejections, where
   * it turns "rejected" into something countable and reviewable.
   */
  reason: z.string().trim().max(200).optional(),
});

// --- Offers -----------------------------------------------------------------

/** Create or update the offer terms. Kept as a draft until it is explicitly extended. */
export const upsertOfferSchema = z.object({
  salaryAmount: z.number().int().min(0).max(100_000_000).nullable().optional(),
  salaryCurrency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

/**
 * Offer lifecycle. Transitions are validated server-side rather than trusting the client,
 * because the candidate's pipeline stage is derived from this.
 */
export const offerActionSchema = z.object({
  action: z.enum(['extend', 'accept', 'decline', 'withdraw']),
  /** Required when declining — the counterpart to a rejection reason. */
  reason: z.string().trim().max(200).optional(),
  /** Whether to email the candidate about the offer (default true for 'extend'). */
  notifyCandidate: z.boolean().optional(),
});

// --- Candidate notes & scorecards -------------------------------------------

export const createNoteSchema = z
  .object({
    body: z.string().trim().max(5000).optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((v) => (v.body && v.body.length > 0) || v.rating != null, {
    message: 'Add a note, a rating, or both.',
  });

// --- Interviews / scheduler -------------------------------------------------

export const createInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  title: z.string().max(255).nullable().optional(),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(600).default(45),
  mode: z.enum(['video', 'onsite', 'phone', 'ai_voice']).default('video'),
  location: z.string().max(1000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  reminderMinutes: z.number().int().min(0).max(10080).default(30),
  // Whether to email the candidate an invitation with the details (default true).
  notifyCandidate: z.boolean().optional(),
});

export const updateInterviewSchema = z
  .object({
    title: z.string().max(255).nullable().optional(),
    scheduledAt: z.coerce.date().optional(),
    durationMinutes: z.number().int().min(5).max(600).optional(),
    mode: z.enum(['video', 'onsite', 'phone', 'ai_voice']).optional(),
    location: z.string().max(1000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    reminderMinutes: z.number().int().min(0).max(10080).optional(),
    status: z.enum(['scheduled', 'completed', 'canceled', 'no_show']).optional(),
    notifyCandidate: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
