import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const jobStatusEnum = pgEnum('job_status', ['open', 'closed', 'draft']);

export const candidateStageEnum = pgEnum('candidate_stage', [
  'new',
  'shortlisted',
  'rejected',
  'interviewing',
  'hired',
]);

export const analysisStatusEnum = pgEnum('analysis_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

// ---------------------------------------------------------------------------
// HR users (recruiters)
// ---------------------------------------------------------------------------

export const hrUsers = pgTable('hr_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }).notNull().default('recruiter'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Quiz / exam (authored by HR per job)
// ---------------------------------------------------------------------------

export type QuizQuestionType = 'single' | 'multiple' | 'short';

export type QuizOption = {
  id: string;
  text: string;
};

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  // For 'single' / 'multiple'
  options?: QuizOption[];
  correctOptionIds?: string[];
  // For 'short' (AI-graded) — guidance the model grades against
  rubric?: string | null;
};

export type QuizAnswer = {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string;
};

export type QuizQuestionResult = {
  questionId: string;
  prompt: string;
  type: QuizQuestionType;
  points: number;
  awarded: number;
  correct: boolean;
  feedback?: string | null;
};

// ---------------------------------------------------------------------------
// Jobs / positions
// ---------------------------------------------------------------------------

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  department: varchar('department', { length: 255 }),
  location: varchar('location', { length: 255 }),
  employmentType: varchar('employment_type', { length: 100 }),
  description: text('description').notNull(),
  // Structured requirements the AI scores against
  requiredSkills: jsonb('required_skills').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  niceToHaveSkills: jsonb('nice_to_have_skills').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  minYearsExperience: integer('min_years_experience'),
  educationRequirement: text('education_requirement'),
  // Optional position-specific exam/quiz (includes correct answers — never sent to applicants)
  quiz: jsonb('quiz').$type<QuizQuestion[]>().notNull().default(sql`'[]'::jsonb`),
  status: jobStatusEnum('status').notNull().default('open'),
  createdBy: uuid('created_by').references(() => hrUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Candidates / applications
// ---------------------------------------------------------------------------

export type ExtractedExperience = {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
};

export type ExtractedEducation = {
  institution: string;
  degree: string | null;
  field: string | null;
  year: string | null;
};

export type SkillMatch = {
  skill: string;
  matched: boolean;
  evidence: string | null;
};

export const candidates = pgTable('candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),

  // Applicant-provided contact info
  fullName: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),

  // Which platform / channel the applicant came from (indeed, linkedin, jobstreet, direct, …)
  source: varchar('source', { length: 100 }).notNull().default('direct'),

  // Opaque token for the public status-tracking link emailed to the applicant.
  trackingToken: uuid('tracking_token').defaultRandom().notNull().unique(),

  // Original CV
  cvFilename: varchar('cv_filename', { length: 512 }),
  cvStoragePath: text('cv_storage_path'),
  cvText: text('cv_text'),

  // AI-extracted structured info
  extractedSkills: jsonb('extracted_skills').$type<string[]>(),
  extractedExperience: jsonb('extracted_experience').$type<ExtractedExperience[]>(),
  extractedEducation: jsonb('extracted_education').$type<ExtractedEducation[]>(),
  extractedCertifications: jsonb('extracted_certifications').$type<string[]>(),
  totalYearsExperience: integer('total_years_experience'),

  // AI evaluation vs the job
  qualificationScore: integer('qualification_score'), // 0-100
  skillsMatchScore: integer('skills_match_score'), // 0-100
  skillMatches: jsonb('skill_matches').$type<SkillMatch[]>(),
  strengths: jsonb('strengths').$type<string[]>(),
  concerns: jsonb('concerns').$type<string[]>(),
  summary: text('summary'),
  recommendation: varchar('recommendation', { length: 50 }), // e.g. strong_match / possible / not_a_fit

  // AI-generated-content detection (heuristic estimate)
  aiLikelihood: integer('ai_likelihood'), // 0-100 estimated likelihood the CV was AI-written
  aiVerdict: varchar('ai_verdict', { length: 20 }), // unlikely | possible | likely
  aiSignals: jsonb('ai_signals').$type<string[]>(),

  // Quiz / exam results
  quizAnswers: jsonb('quiz_answers').$type<QuizAnswer[]>(),
  quizResults: jsonb('quiz_results').$type<QuizQuestionResult[]>(),
  quizScore: integer('quiz_score'), // 0-100 normalized (null if job has no quiz)

  // Combined ranking score: CV qualification + quiz (0-100)
  overallScore: integer('overall_score'),

  // Pipeline / workflow state
  stage: candidateStageEnum('stage').notNull().default('new'),
  analysisStatus: analysisStatusEnum('analysis_status').notNull().default('pending'),
  analysisError: text('analysis_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Email notification log
// ---------------------------------------------------------------------------

export const emailLogs = pgTable('email_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  type: varchar('type', { length: 50 }).notNull(), // application_received | status_update
  toEmail: varchar('to_email', { length: 255 }).notNull(),
  subject: text('subject').notNull(),
  status: varchar('status', { length: 20 }).notNull(), // sent | skipped | failed
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EmailLog = typeof emailLogs.$inferSelect;
export type HrUser = typeof hrUsers.$inferSelect;
export type NewHrUser = typeof hrUsers.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
