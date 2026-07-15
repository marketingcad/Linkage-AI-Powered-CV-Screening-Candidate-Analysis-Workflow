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
export function login(email: string, password: string) {
  return apiRequest<{ token: string; user: HrUser }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}
export function fetchMe() {
  return apiRequest<{ user: HrUser }>('/auth/me');
}

// --- Public jobs / applications --------------------------------------------
export function fetchPublicJobs() {
  return apiRequest<{ jobs: PublicJobListItem[] }>('/jobs/public', { auth: false });
}
export function fetchPublicJob(id: string) {
  return apiRequest<{ job: PublicJob }>(`/jobs/public/${id}`, { auth: false });
}
export function prefillFromCv(file: File) {
  const form = new FormData();
  form.append('cv', file);
  return apiRequest<{ contact: { fullName: string | null; email: string | null; phone: string | null } }>(
    '/applications/prefill',
    { method: 'POST', body: form, isForm: true, auth: false },
  );
}
export function submitApplication(form: FormData) {
  return apiRequest<{
    message: string;
    candidateId: string;
    analysisStatus: string;
    trackingToken: string;
  }>('/applications', { method: 'POST', body: form, isForm: true, auth: false });
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
