import { useState } from 'react';
import { createJob, generateQuiz, updateJob, type JobInput } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { Job, JobStatus, QuizQuestion } from '../api/types';
import { Alert, Spinner } from './ui';
import QuizBuilder from './QuizBuilder';

function parseSkills(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function JobForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Job;
  onClose: () => void;
  onSaved: (job: Job) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [department, setDepartment] = useState(existing?.department ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [employmentType, setEmploymentType] = useState(existing?.employmentType ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [requiredSkills, setRequiredSkills] = useState(
    (existing?.requiredSkills ?? []).join(', '),
  );
  const [niceToHaveSkills, setNiceToHaveSkills] = useState(
    (existing?.niceToHaveSkills ?? []).join(', '),
  );
  const [minYears, setMinYears] = useState(
    existing?.minYearsExperience != null ? String(existing.minYearsExperience) : '',
  );
  const [education, setEducation] = useState(existing?.educationRequirement ?? '');
  const [quiz, setQuiz] = useState<QuizQuestion[]>(existing?.quiz ?? []);
  const [status, setStatus] = useState<JobStatus>(existing?.status ?? 'open');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI quiz generation
  const [genCount, setGenCount] = useState(5);
  const [genDifficulty, setGenDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function handleGenerateQuiz() {
    setGenError(null);
    if (title.trim().length < 2 || description.trim().length < 10) {
      setGenError('Add a job title and description first so the AI can tailor the exam.');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateQuiz({
        title: title.trim(),
        description: description.trim(),
        requiredSkills: parseSkills(requiredSkills),
        niceToHaveSkills: parseSkills(niceToHaveSkills),
        minYearsExperience: minYears ? Number(minYears) : null,
        educationRequirement: education.trim() || null,
        count: genCount,
        difficulty: genDifficulty,
      });
      // Append generated questions so any manual ones are kept.
      setQuiz((prev) => [...prev, ...res.quiz]);
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : 'Failed to generate quiz');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: JobInput = {
      title: title.trim(),
      department: department.trim() || undefined,
      location: location.trim() || undefined,
      employmentType: employmentType.trim() || undefined,
      description: description.trim(),
      requiredSkills: parseSkills(requiredSkills),
      niceToHaveSkills: parseSkills(niceToHaveSkills),
      minYearsExperience: minYears ? Number(minYears) : null,
      educationRequirement: education.trim() || null,
      quiz,
      status,
    };

    setSaving(true);
    try {
      const res = existing
        ? await updateJob(existing.id, payload)
        : await createJob(payload);
      onSaved(res.job);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save job');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {existing ? 'Edit job' : 'New job'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <Field label="Job title">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder="Senior Frontend Engineer"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Department">
              <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Location">
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Employment type">
              <input
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className={inputCls}
                placeholder="Full-time"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className={inputCls}
              placeholder="Role responsibilities, team, and what you're looking for…"
            />
          </Field>

          <Field label="Required skills (comma separated)">
            <input
              value={requiredSkills}
              onChange={(e) => setRequiredSkills(e.target.value)}
              className={inputCls}
              placeholder="React, TypeScript, REST APIs"
            />
          </Field>

          <Field label="Nice-to-have skills (comma separated)">
            <input
              value={niceToHaveSkills}
              onChange={(e) => setNiceToHaveSkills(e.target.value)}
              className={inputCls}
              placeholder="GraphQL, AWS"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Min. years experience">
              <input
                type="number"
                min={0}
                value={minYears}
                onChange={(e) => setMinYears(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as JobStatus)}
                className={inputCls}
              >
                <option value="open">Open</option>
                <option value="draft">Draft</option>
                <option value="closed">Closed</option>
              </select>
            </Field>
            <Field label="Education requirement">
              <input value={education} onChange={(e) => setEducation(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">Screening exam / quiz</span>
              <span className="text-xs text-slate-400">
                {quiz.length} question{quiz.length === 1 ? '' : 's'} · optional
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Applicants answer these when they apply. Choice questions are auto-graded; short
              answers are graded by AI. The quiz score is combined with the CV match.
            </p>

            {/* AI generation */}
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
              <span className="text-sm font-medium text-brand-800">✨ Generate with AI</span>
              <select
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
              >
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} questions
                  </option>
                ))}
              </select>
              <select
                value={genDifficulty}
                onChange={(e) => setGenDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <button
                type="button"
                onClick={handleGenerateQuiz}
                disabled={generating}
                className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {generating ? <Spinner /> : quiz.length ? 'Generate more' : 'Generate exam'}
              </button>
              <span className="text-xs text-slate-500">from the job details above</span>
            </div>
            {genError && (
              <div className="mb-3">
                <Alert kind="error">{genError}</Alert>
              </div>
            )}

            <QuizBuilder value={quiz} onChange={setQuiz} />
          </div>

          {error && <Alert kind="error">{error}</Alert>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {saving ? <Spinner /> : existing ? 'Save changes' : 'Create job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
