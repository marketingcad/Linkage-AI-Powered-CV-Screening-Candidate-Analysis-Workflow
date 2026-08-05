import { apiRequest } from './client';
import type {
  ApplicationStatus,
  AuditLog,
  Candidate,
  CandidateNote,
  CandidateStage,
  CandidateSummary,
  DuplicateApplication,
  EmailLog,
  HrUser,
  Job,
  JobStatus,
  JobSummary,
  PublicJobResponse,
  PublicJobListItem,
  Interview,
  InterviewMode,
  InterviewStatus,
  Offer,
  OfferAction,
  PipelineStats,
  QuizQuestion,
  RankedCandidate,
  RejectionReason,
  ScoringWeights,
  Stats,
  TalentMatch,
} from './types';

// --- Auth -------------------------------------------------------------------
export type LoginResult =
  | { token: string; user: HrUser; mfaRequired?: false }
  | { mfaRequired: true; mfaToken: string };

export function login(email: string, password: string) {
  return apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}
export function loginMfa(mfaToken: string, code: string) {
  return apiRequest<{ token: string; user: HrUser }>('/auth/login/mfa', {
    method: 'POST',
    body: { mfaToken, code },
    auth: false,
  });
}
export function fetchMe() {
  return apiRequest<{ user: HrUser }>('/auth/me');
}

// --- Two-factor (TOTP) ------------------------------------------------------
export function setup2fa() {
  return apiRequest<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', {
    method: 'POST',
  });
}
export function enable2fa(code: string) {
  return apiRequest<{ ok: true; user: HrUser }>('/auth/2fa/enable', {
    method: 'POST',
    body: { code },
  });
}
export function disable2fa(code: string) {
  return apiRequest<{ ok: true; user: HrUser }>('/auth/2fa/disable', {
    method: 'POST',
    body: { code },
  });
}
export interface ProfileUpdate {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
}
export function updateProfile(input: ProfileUpdate) {
  return apiRequest<{ token: string; user: HrUser }>('/auth/me', {
    method: 'PATCH',
    body: input,
  });
}
export function changePassword(oldPassword: string, newPassword: string) {
  return apiRequest<{ ok: true }>('/auth/change-password', {
    method: 'POST',
    body: { oldPassword, newPassword },
  });
}

// --- Public jobs / applications --------------------------------------------
export function fetchPublicJobs() {
  return apiRequest<{ jobs: PublicJobListItem[] }>('/jobs/public', { auth: false });
}
export function fetchPublicJob(id: string) {
  return apiRequest<PublicJobResponse>(`/jobs/public/${id}`, { auth: false });
}
export interface CvDetails {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
}
export function prefillFromCv(file: File) {
  const form = new FormData();
  form.append('cv', file);
  return apiRequest<{ details: CvDetails }>('/applications/prefill', {
    method: 'POST',
    body: form,
    isForm: true,
    auth: false,
  });
}
export function submitApplication(form: FormData) {
  return apiRequest<{
    message: string;
    candidateId: string;
    analysisStatus: string;
    trackingToken: string;
  }>('/applications', { method: 'POST', body: form, isForm: true, auth: false });
}

/** AI re-rank a compared shortlist against the role (first candidate's job). */
export function rankCandidatesAI(candidateIds: string[]) {
  return apiRequest<{ jobTitle: string; ranking: RankedCandidate[] }>('/candidates/rank', {
    method: 'POST',
    body: { candidateIds },
  });
}

/** Rank past applicants (from other roles) by semantic fit to this job. */
export function scanTalentPool(jobId: string, limit = 10) {
  return apiRequest<{ matches: TalentMatch[] }>(`/jobs/${jobId}/talent-pool?limit=${limit}`);
}

/** HR bulk import: upload one CV against a job (client loops over a batch). */
export function importCv(jobId: string, file: File) {
  const form = new FormData();
  form.append('jobId', jobId);
  form.append('cv', file);
  return apiRequest<{ candidate: Candidate }>('/candidates/import', {
    method: 'POST',
    body: form,
    isForm: true,
  });
}
export function fetchApplicationStatus(token: string) {
  return apiRequest<{ application: ApplicationStatus }>(`/applications/status/${token}`, {
    auth: false,
  });
}

// --- HR: jobs ---------------------------------------------------------------
export interface JobInput {
  title: string;
  department?: string;
  location?: string;
  workArrangement?: string;
  employmentType?: string;
  /** ISO date. Omit to let the server stamp it when the role is first opened. */
  requisitionApprovedAt?: string | null;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  minYearsExperience?: number | null;
  educationRequirement?: string | null;
  quiz: QuizQuestion[];
  scoringWeights?: ScoringWeights;
  status: JobStatus;
}
export function fetchJobs() {
  return apiRequest<{ jobs: JobSummary[] }>('/jobs');
}
export function fetchJob(id: string) {
  return apiRequest<{ job: Job }>(`/jobs/${id}`);
}
export interface GenerateQuizInput {
  title: string;
  description: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  minYearsExperience?: number | null;
  educationRequirement?: string | null;
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}
/** Ask the AI to rewrite a job description. Returns the suggestion; it is not saved. */
export function improveJobDescription(input: {
  title: string;
  description: string;
  department?: string | null;
  location?: string | null;
  workArrangement?: string | null;
  employmentType?: string | null;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  minYearsExperience?: number | null;
}) {
  return apiRequest<{ description: string }>('/jobs/improve-description', {
    method: 'POST',
    body: input,
  });
}
export function generateQuiz(input: GenerateQuizInput) {
  return apiRequest<{ quiz: QuizQuestion[] }>('/jobs/generate-quiz', {
    method: 'POST',
    body: input,
  });
}
export function createJob(input: JobInput) {
  return apiRequest<{ job: Job }>('/jobs', { method: 'POST', body: input });
}
export function updateJob(id: string, input: Partial<JobInput>) {
  return apiRequest<{ job: Job }>(`/jobs/${id}`, { method: 'PUT', body: input });
}
export function deleteJob(id: string) {
  return apiRequest<void>(`/jobs/${id}`, { method: 'DELETE' });
}
/** Clone a job (its requirements, skills, quiz, weights) as a new draft. */
export function duplicateJob(id: string) {
  return apiRequest<{ job: Job }>(`/jobs/${id}/duplicate`, { method: 'POST' });
}

// --- HR: candidates ---------------------------------------------------------
export function fetchCandidates(
  params: { jobId?: string; stage?: string; source?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.jobId) q.set('jobId', params.jobId);
  if (params.stage) q.set('stage', params.stage);
  if (params.source) q.set('source', params.source);
  const qs = q.toString();
  return apiRequest<{ candidates: CandidateSummary[] }>(`/candidates${qs ? `?${qs}` : ''}`);
}
export function fetchCandidate(id: string) {
  return apiRequest<{
    candidate: Candidate;
    job: Job | null;
    duplicates: DuplicateApplication[];
  }>(`/candidates/${id}`);
}
/** Move a candidate. `reason` is recorded on the stage event — the basis of the exit metrics. */
export function updateCandidateStage(id: string, stage: CandidateStage, reason?: string) {
  return apiRequest<{ candidate: Candidate }>(`/candidates/${id}/stage`, {
    method: 'PATCH',
    body: reason ? { stage, reason } : { stage },
  });
}
export function fetchRejectionReasons() {
  return apiRequest<{ reasons: RejectionReason[] }>('/candidates/rejection-reasons');
}

// --- HR: offers -------------------------------------------------------------
export function fetchOffer(candidateId: string) {
  return apiRequest<{ offer: Offer | null }>(`/candidates/${candidateId}/offer`);
}
/** Save the terms. The offer stays a draft until it is explicitly extended. */
export function saveOffer(
  candidateId: string,
  terms: {
    salaryAmount?: number | null;
    salaryCurrency?: string | null;
    startDate?: string | null;
    expiresAt?: string | null;
    notes?: string | null;
  },
) {
  return apiRequest<{ offer: Offer }>(`/candidates/${candidateId}/offer`, {
    method: 'PUT',
    body: terms,
  });
}
export function actOnOffer(candidateId: string, action: OfferAction, reason?: string) {
  return apiRequest<{ offer: Offer }>(`/candidates/${candidateId}/offer/action`, {
    method: 'POST',
    body: reason ? { action, reason } : { action },
  });
}
export function fetchPipelineStats() {
  return apiRequest<PipelineStats>('/stats/pipeline');
}
export function deleteCandidate(id: string) {
  return apiRequest<{ ok: true }>(`/candidates/${id}`, { method: 'DELETE' });
}
export function fetchAuditLog() {
  return apiRequest<{ entries: AuditLog[] }>('/audit');
}
export function reanalyzeCandidate(id: string) {
  return apiRequest<{ candidate: Candidate }>(`/candidates/${id}/reanalyze`, { method: 'POST' });
}
/** Generate (or regenerate) AI interview questions tailored to a candidate. */
export function generateInterviewQuestions(id: string) {
  return apiRequest<{ candidate: Candidate }>(`/candidates/${id}/interview-questions`, {
    method: 'POST',
  });
}
// --- Candidate notes & human scorecards ---
export function fetchCandidateNotes(id: string) {
  return apiRequest<{ notes: CandidateNote[]; humanScore: number | null; ratingCount: number }>(
    `/candidates/${id}/notes`,
  );
}
export function addCandidateNote(id: string, input: { body?: string; rating?: number | null }) {
  return apiRequest<{ note: CandidateNote }>(`/candidates/${id}/notes`, {
    method: 'POST',
    body: input,
  });
}
export function deleteCandidateNote(candidateId: string, noteId: string) {
  return apiRequest<{ ok: true }>(`/candidates/${candidateId}/notes/${noteId}`, {
    method: 'DELETE',
  });
}
export function fetchCandidateEmails(id: string) {
  return apiRequest<{ emails: EmailLog[] }>(`/candidates/${id}/emails`);
}
export function resendCandidateEmail(id: string, type: 'confirmation' | 'status') {
  return apiRequest<{ result: { sent: boolean; skipped?: boolean; error?: string } }>(
    `/candidates/${id}/resend`,
    { method: 'POST', body: { type } },
  );
}

// --- HR: stats --------------------------------------------------------------
export function fetchStats() {
  return apiRequest<Stats>('/stats');
}

// --- HR: interviews / scheduler --------------------------------------------
export interface InterviewInput {
  candidateId: string;
  title?: string | null;
  scheduledAt: string; // ISO timestamp
  durationMinutes?: number;
  mode?: InterviewMode;
  location?: string | null;
  notes?: string | null;
  reminderMinutes?: number;
  /** Email the candidate an invitation with the details (default true). */
  notifyCandidate?: boolean;
}
/** Outcome of a candidate-facing email send. */
export interface EmailResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}
export function fetchInterviews(
  params: { from?: string; to?: string; status?: string; candidateId?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.status) q.set('status', params.status);
  if (params.candidateId) q.set('candidateId', params.candidateId);
  const qs = q.toString();
  return apiRequest<{ interviews: Interview[] }>(`/interviews${qs ? `?${qs}` : ''}`);
}
export function createInterview(input: InterviewInput) {
  return apiRequest<{ interview: Interview; email?: EmailResult }>('/interviews', {
    method: 'POST',
    body: input,
  });
}
export function updateInterview(
  id: string,
  input: Partial<InterviewInput> & { status?: InterviewStatus },
) {
  return apiRequest<{ interview: Interview; email?: EmailResult }>(`/interviews/${id}`, {
    method: 'PATCH',
    body: input,
  });
}
export function deleteInterview(id: string) {
  return apiRequest<{ ok: true }>(`/interviews/${id}`, { method: 'DELETE' });
}
/** Generate the candidate join link for an ai_voice interview. */
export function fetchAiInterviewLink(interviewId: string) {
  return apiRequest<{ link: string; token: string }>(
    `/ai-interview/interviews/${interviewId}/link`,
    { method: 'POST' },
  );
}

export type AiInterviewContext = {
  candidateName: string;
  scheduledAt: string;
  durationMinutes: number;
  leadMinutes: number;
  state: 'too_early' | 'open' | 'expired';
};
/** Public: candidate page reads the scheduled time + window state from a signed link token. */
export function fetchAiInterviewContext(token: string) {
  return apiRequest<AiInterviewContext>(`/ai-interview/context?t=${encodeURIComponent(token)}`);
}
/** Public: candidate joins — returns a LiveKit url + access token. */
export function startAiInterviewSession(token: string) {
  return apiRequest<{ url: string; token: string }>(`/ai-interview/session`, {
    method: 'POST',
    body: { token, consent: true },
  });
}

// --- Team management (admin only) -------------------------------------------

export type TeamRole = 'admin' | 'member';
export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  avatarUrl: string | null;
  totpEnabled: boolean;
  createdAt: string;
};
export function fetchTeam() {
  return apiRequest<{ members: TeamMember[]; roles: TeamRole[] }>('/team');
}
export function createTeamMember(input: {
  name: string;
  email: string;
  password: string;
  role: TeamRole;
}) {
  return apiRequest<{ member: TeamMember }>('/team', { method: 'POST', body: input });
}
export function updateTeamMember(id: string, input: { name?: string; role?: TeamRole }) {
  return apiRequest<{ member: TeamMember }>(`/team/${id}`, { method: 'PATCH', body: input });
}
export function removeTeamMember(id: string) {
  return apiRequest<{ ok: true }>(`/team/${id}`, { method: 'DELETE' });
}

export type AiCompetencyRating = {
  competency: string;
  /** 0 = not assessed, else 1–5 on the anchored scale. */
  rating: number;
  evidence: string;
};
export type AiInterviewSummary = {
  overview: string;
  /** Absent on interviews summarized before anchored scoring shipped. */
  competencies?: AiCompetencyRating[];
  strengths: string[];
  concerns: string[];
  recommendation: 'advance' | 'hold' | 'reject';
  score: number;
};
export type AiInterviewSession = {
  id: string;
  status: 'pending' | 'live' | 'recording' | 'processing' | 'ready' | 'failed';
  recordingUrl: string | null;
  transcript: { role: 'agent' | 'candidate'; text: string; at?: number }[] | null;
  aiSummary: AiInterviewSummary | null;
  durationSeconds: number | null;
  tabAwayCount?: number;
  tabAwaySeconds?: number;
  startedAt: string | null;
  endedAt: string | null;
};
/** One row in the interview recording library. */
export type AiInterviewSessionSummary = {
  id: string;
  interviewId: string;
  candidateId: string;
  candidateName: string | null;
  candidateEmail: string | null;
  candidateStage: string | null;
  jobId: string | null;
  jobTitle: string | null;
  interviewTitle: string | null;
  scheduledAt: string | null;
  status: AiInterviewSession['status'];
  hasRecording: boolean;
  transcriptTurns: number;
  aiSummary: AiInterviewSummary | null;
  durationSeconds: number | null;
  /** Advisory: times the candidate left the interview tab, and total seconds away. */
  tabAwayCount: number;
  tabAwaySeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};
/** Authed: every AI voice interview, newest first. */
export function fetchAiInterviewSessions(
  params: { jobId?: string; status?: string; q?: string; hasRecording?: boolean } = {},
) {
  const qs = new URLSearchParams();
  if (params.jobId) qs.set('jobId', params.jobId);
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  if (params.hasRecording !== undefined) qs.set('hasRecording', String(params.hasRecording));
  const s = qs.toString();
  return apiRequest<{ sessions: AiInterviewSessionSummary[]; recordingEnabled: boolean }>(
    `/ai-interview/sessions${s ? `?${s}` : ''}`,
  );
}
/** Authed: mint a short-lived signed URL for one recording (called when play is pressed). */
export function fetchAiRecordingUrl(sessionId: string) {
  return apiRequest<{ url: string }>(`/ai-interview/sessions/${sessionId}/recording`);
}

/** Authed: HR review of an AI voice interview (transcript, summary, signed recording URL). */
export function fetchAiInterviewSession(interviewId: string) {
  return apiRequest<{ session: AiInterviewSession | null }>(
    `/ai-interview/interviews/${interviewId}/session`,
  );
}
