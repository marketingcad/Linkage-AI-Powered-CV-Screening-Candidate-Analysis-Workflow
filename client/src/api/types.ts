export type Recommendation = 'strong_match' | 'possible' | 'not_a_fit';
export type CandidateStage =
  | 'new'
  | 'shortlisted'
  | 'rejected'
  | 'interviewing'
  | 'hired';
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type JobStatus = 'open' | 'closed' | 'draft';
export type QuizQuestionType = 'single' | 'multiple' | 'short';

export interface HrUser {
  sub?: string;
  id?: string;
  email: string;
  name: string;
  role: string;
  /** Optional profile picture URL; falls back to a placeholder avatar when absent. */
  avatarUrl?: string;
  /** Whether TOTP two-factor authentication is active on the account. */
  totpEnabled?: boolean;
}

export interface QuizOption {
  id: string;
  text: string;
}

/** Full quiz question (HR-authored, includes answers). */
export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  options?: QuizOption[];
  correctOptionIds?: string[];
  rubric?: string | null;
}

/** Quiz question as sent to applicants (no answers). */
export interface PublicQuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  options?: QuizOption[];
}

export interface QuizAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string;
}

export interface QuizQuestionResult {
  questionId: string;
  prompt: string;
  type: QuizQuestionType;
  points: number;
  awarded: number;
  correct: boolean;
  feedback?: string | null;
}

/** Job as shown on the public careers board (list). No quiz payload — just a count. */
export interface PublicJobListItem {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  quizCount: number;
}

/** Full public job (single) shown on the application page — includes the sanitized quiz. */
export interface PublicJob {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  quiz: PublicQuizQuestion[];
}

export interface JobSummary {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  status: JobStatus;
  minYearsExperience: number | null;
  requiredSkills: string[];
  createdAt: string;
  candidateCount: number;
}

/** Relative importance of each scoring component in the overall ranking (per job).
 * Values are 0-100 and are normalized at compute time, so they need not sum to 100. */
export interface ScoringWeights {
  skills: number;
  experience: number;
  education: number;
  quiz: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  skills: 40,
  experience: 30,
  education: 15,
  quiz: 15,
};

export interface Job {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  minYearsExperience: number | null;
  educationRequirement: string | null;
  quiz: QuizQuestion[];
  scoringWeights: ScoringWeights;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedExperience {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
}

export interface ExtractedEducation {
  institution: string;
  degree: string | null;
  field: string | null;
  year: string | null;
}

export interface SkillMatch {
  skill: string;
  matched: boolean;
  evidence: string | null;
}

export type ScoreComponentKey = 'skills' | 'experience' | 'education';

/** Per-component "why this score" rationale + verbatim CV evidence. */
export interface ScoreExplanation {
  component: ScoreComponentKey;
  reasoning: string;
  evidence: string[];
}

export type InterviewFocus = 'strength' | 'concern' | 'skill' | 'experience' | 'motivation';

/** An AI-suggested, candidate-tailored interview question. */
export interface InterviewQuestion {
  focus: InterviewFocus;
  question: string;
  rationale: string;
}

/** AI re-ranking of a compared shortlist against a role. */
export interface RankedCandidate {
  candidateId: string;
  rank: number;
  fitScore: number;
  reason: string;
}

/** An entry in the HR activity/audit log. */
export interface AuditLog {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

/** A past applicant (from another role) ranked by semantic fit to a new job. */
export interface TalentMatch {
  id: string;
  fullName: string;
  email: string;
  jobId: string;
  jobTitle: string | null;
  overallScore: number | null;
  qualificationScore: number | null;
  stage: CandidateStage;
  similarity: number;
}

/** Another application by the same person (same email) — for duplicate detection. */
export interface DuplicateApplication {
  id: string;
  jobId: string;
  jobTitle: string | null;
  stage: CandidateStage;
  overallScore: number | null;
  qualificationScore: number | null;
  createdAt: string;
}

export interface CandidateSummary {
  id: string;
  jobId: string;
  jobTitle: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  source: string;
  qualificationScore: number | null;
  skillsMatchScore: number | null;
  experienceScore: number | null;
  educationScore: number | null;
  quizScore: number | null;
  overallScore: number | null;
  aiLikelihood: number | null;
  aiVerdict: 'unlikely' | 'possible' | 'likely' | null;
  recommendation: Recommendation | null;
  summary: string | null;
  totalYearsExperience: number | null;
  extractedSkills: string[] | null;
  stage: CandidateStage;
  analysisStatus: AnalysisStatus;
  createdAt: string;
  /** Earliest upcoming scheduled interview (ISO), or null if none is booked. */
  nextInterviewAt?: string | null;
}

export interface Candidate extends CandidateSummary {
  location: string | null;
  currentTitle: string | null;
  declaredYearsExperience: number | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  noticePeriod: string | null;
  expectedSalary: string | null;
  coverNote: string | null;
  /** Candidate-proposed interview slots (ISO timestamps, up to 3). */
  availabilitySlots: string[] | null;
  cvFilename: string | null;
  cvStoragePath: string | null;
  cvText: string | null;
  extractedSkills: string[] | null;
  extractedExperience: ExtractedExperience[] | null;
  extractedEducation: ExtractedEducation[] | null;
  extractedCertifications: string[] | null;
  skillMatches: SkillMatch[] | null;
  scoreExplanations: ScoreExplanation[] | null;
  interviewQuestions: InterviewQuestion[] | null;
  strengths: string[] | null;
  concerns: string[] | null;
  aiSignals: string[] | null;
  quizAnswers: QuizAnswer[] | null;
  quizResults: QuizQuestionResult[] | null;
  analysisError: string | null;
  updatedAt: string;
}

export interface ApplicationStatus {
  fullName: string;
  jobTitle: string | null;
  jobLocation: string | null;
  submittedAt: string;
  updatedAt: string;
  stage: CandidateStage;
  status: { label: string; message: string; tone: 'neutral' | 'positive' | 'negative' };
  timeline: CandidateStage[];
}

export interface EmailLog {
  id: string;
  candidateId: string;
  type: 'application_received' | 'status_update';
  toEmail: string;
  subject: string;
  status: 'sent' | 'skipped' | 'failed';
  error: string | null;
  createdAt: string;
}

export type InterviewMode = 'video' | 'onsite' | 'phone';
export type InterviewStatus = 'scheduled' | 'completed' | 'canceled';

/** A scheduled interview pinned to the calendar (with candidate + job info joined). */
export interface Interview {
  id: string;
  candidateId: string;
  jobId: string | null;
  title: string | null;
  scheduledAt: string; // ISO timestamp
  durationMinutes: number;
  mode: InterviewMode;
  location: string | null;
  notes: string | null;
  reminderMinutes: number;
  reminderSent: boolean;
  status: InterviewStatus;
  createdAt: string;
  updatedAt: string;
  candidateName: string | null;
  candidateEmail: string | null;
  candidateStage: CandidateStage | null;
  jobTitle: string | null;
}

export interface Stats {
  totalCandidates: number;
  avgScore: number;
  openJobs: number;
  byStage: { stage: CandidateStage; value: number }[];
  bySource: { source: string; value: number }[];
}
