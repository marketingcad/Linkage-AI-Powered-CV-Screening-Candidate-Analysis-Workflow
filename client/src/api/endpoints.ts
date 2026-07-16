import { apiRequest } from './client';
import type {
  ApplicationStatus,
  Candidate,
  CandidateStage,
  CandidateSummary,
  EmailLog,
  HrUser,
  Job,
  JobStatus,
  JobSummary,
  PublicJob,
  PublicJobListItem,
  QuizQuestion,
  Stats,
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
  return apiRequest<{ job: PublicJob }>(`/jobs/public/${id}`, { auth: false });
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
  employmentType?: string;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  minYearsExperience?: number | null;
  educationRequirement?: string | null;
  quiz: QuizQuestion[];
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
  return apiRequest<{ candidate: Candidate; job: Job | null }>(`/candidates/${id}`);
}
export function updateCandidateStage(id: string, stage: CandidateStage) {
  return apiRequest<{ candidate: Candidate }>(`/candidates/${id}/stage`, {
    method: 'PATCH',
    body: { stage },
  });
}
export function reanalyzeCandidate(id: string) {
  return apiRequest<{ candidate: Candidate }>(`/candidates/${id}/reanalyze`, { method: 'POST' });
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
