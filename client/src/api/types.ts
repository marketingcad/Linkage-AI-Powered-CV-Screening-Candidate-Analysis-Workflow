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
  quizScore: number | null;
  overallScore: number | null;
  aiLikelihood: number | null;
  aiVerdict: 'unlikely' | 'possible' | 'likely' | null;
  recommendation: Recommendation | null;
  summary: string | null;
  totalYearsExperience: number | null;
  stage: CandidateStage;
  analysisStatus: AnalysisStatus;
  createdAt: string;
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
  cvFilename: string | null;
  cvStoragePath: string | null;
  cvText: string | null;
  extractedSkills: string[] | null;
  extractedExperience: ExtractedExperience[] | null;
  extractedEducation: ExtractedEducation[] | null;
  extractedCertifications: string[] | null;
  skillMatches: SkillMatch[] | null;
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

export interface Stats {
  totalCandidates: number;
  avgScore: number;
  openJobs: number;
  byStage: { stage: CandidateStage; value: number }[];
  bySource: { source: string; value: number }[];
}
