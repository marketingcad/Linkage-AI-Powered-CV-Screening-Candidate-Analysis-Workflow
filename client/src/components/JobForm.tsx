import { useState } from 'react';
import { LuBriefcase, LuRotateCcw, LuScale } from 'react-icons/lu';
import { createJob, generateQuiz, updateJob, type JobInput } from '../api/endpoints';
import { ApiError } from '../api/client';
import {
  DEFAULT_SCORING_WEIGHTS,
  type Job,
  type JobStatus,
  type QuizQuestion,
  type ScoringWeights,
} from '../api/types';
import { Alert, Button, Spinner } from './ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import FieldError from './FieldError';
import { useFormErrors } from '../lib/useFormErrors';
import * as v from '../lib/validators';
import QuizBuilder from './QuizBuilder';

/** No shared LIMITS entry — the server caps employment type at 100 characters. */
const EMPLOYMENT_TYPE_MAX = 100;

function parseSkills(raw: string): string[] {
  return raw
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
  const [weights, setWeights] = useState<ScoringWeights>(
    existing?.scoringWeights ?? DEFAULT_SCORING_WEIGHTS,
  );
  const [status, setStatus] = useState<JobStatus>(existing?.status ?? 'open');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useFormErrors('job');

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

    // Validate everything up front so all problems show inline at once instead of one
    // server round-trip per mistake.
    const weightTotal = WEIGHT_ROWS.reduce((sum, r) => sum + (weights[r.key] || 0), 0);
    const ok = fieldErrors.validate({
      title:
        v.required(title, 'Job title') ??
        v.minLen(title, 2, 'Job title') ??
        v.maxLen(title, v.LIMITS.jobTitle, 'Job title'),
      department: v.maxLen(department, v.LIMITS.jobTitle, 'Department'),
      location: v.maxLen(location, v.LIMITS.location, 'Location'),
      employmentType: v.maxLen(employmentType, EMPLOYMENT_TYPE_MAX, 'Employment type'),
      description:
        v.required(description, 'Description') ??
        v.minLen(description, 10, 'Description') ??
        v.maxLen(description, v.LIMITS.jobDescription, 'Description'),
      minYears: v.intInRange(minYears, { min: 0, max: 60, label: 'Min. years experience' }),
      education: v.maxLen(education, v.LIMITS.educationRequirement, 'Education requirement'),
      // All-zero weights would save happily and then rank every candidate at zero.
      scoringWeights: weightTotal > 0 ? undefined : 'Set at least one weight above zero.',
    });
    if (!ok) return;

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
      scoringWeights: weights,
      status,
    };

    setSaving(true);
    try {
      const res = existing
        ? await updateJob(existing.id, payload)
        : await createJob(payload);
      onSaved(res.job);
    } catch (err) {
      // Field-level details from the server land on their fields; the rest is form-level.
      fieldErrors.setServerError(err, 'Failed to save job');
      setError(err instanceof ApiError ? err.message : 'Failed to save job');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 px-6 py-4 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LuBriefcase className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="font-display text-lg font-semibold text-slate-900">
                {existing ? 'Edit job' : 'New job'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Define the role and its screening exam.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label="Job title" required error={fieldErrors.errors.title} errorId={fieldErrors.errorId('title')}>
            <input
              required
              maxLength={v.LIMITS.jobTitle}
              value={title}
              onChange={(e) => { setTitle(e.target.value); fieldErrors.clearError('title'); }}
              className={inputCls}
              placeholder="Senior Frontend Engineer"
              {...fieldErrors.fieldProps('title')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Department" error={fieldErrors.errors.department} errorId={fieldErrors.errorId('department')}>
              <input
                maxLength={v.LIMITS.jobTitle}
                value={department}
                onChange={(e) => { setDepartment(e.target.value); fieldErrors.clearError('department'); }}
                className={inputCls}
                {...fieldErrors.fieldProps('department')}
              />
            </Field>
            <Field label="Location" error={fieldErrors.errors.location} errorId={fieldErrors.errorId('location')}>
              <input
                maxLength={v.LIMITS.location}
                value={location}
                onChange={(e) => { setLocation(e.target.value); fieldErrors.clearError('location'); }}
                className={inputCls}
                {...fieldErrors.fieldProps('location')}
              />
            </Field>
            <Field label="Employment type" error={fieldErrors.errors.employmentType} errorId={fieldErrors.errorId('employmentType')}>
              <input
                maxLength={EMPLOYMENT_TYPE_MAX}
                value={employmentType}
                onChange={(e) => { setEmploymentType(e.target.value); fieldErrors.clearError('employmentType'); }}
                className={inputCls}
                placeholder="Full-time"
                {...fieldErrors.fieldProps('employmentType')}
              />
            </Field>
          </div>

          <Field label="Description" required error={fieldErrors.errors.description} errorId={fieldErrors.errorId('description')}>
            <textarea
              required
              maxLength={v.LIMITS.jobDescription}
              value={description}
              onChange={(e) => { setDescription(e.target.value); fieldErrors.clearError('description'); }}
              rows={5}
              className={inputCls}
              placeholder="Role responsibilities, team, and what you're looking for…"
              {...fieldErrors.fieldProps('description')}
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
            <Field label="Min. years experience" error={fieldErrors.errors.minYears} errorId={fieldErrors.errorId('minYears')}>
              <input
                type="number"
                min={0}
                max={60}
                value={minYears}
                onChange={(e) => { setMinYears(e.target.value); fieldErrors.clearError('minYears'); }}
                className={inputCls}
                {...fieldErrors.fieldProps('minYears')}
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
            <Field label="Education requirement" error={fieldErrors.errors.education} errorId={fieldErrors.errorId('education')}>
              <input
                maxLength={v.LIMITS.educationRequirement}
                value={education}
                onChange={(e) => { setEducation(e.target.value); fieldErrors.clearError('education'); }}
                className={inputCls}
                {...fieldErrors.fieldProps('education')}
              />
            </Field>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                <LuScale className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold text-slate-800">Ranking weights</span>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Control how much each factor counts toward a candidate&apos;s overall score for this
              role. They don&apos;t need to add up to 100 — we balance them for you. Changing them
              instantly re-ranks existing candidates.
            </p>
            <WeightsEditor
              value={weights}
              onChange={(w) => { setWeights(w); fieldErrors.clearError('scoringWeights'); }}
              hasQuiz={quiz.length > 0}
              error={fieldErrors.errors.scoringWeights}
              errorId={fieldErrors.errorId('scoringWeights')}
            />
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

            {(error || fieldErrors.formError) && (
              <Alert kind="error">{error ?? fieldErrors.formError}</Alert>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : existing ? 'Save changes' : 'Create job'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25';

/**
 * Labelled field with a required marker and an inline error slot. The error is rendered by
 * FieldError and referenced from the input via aria-describedby (see useFormErrors).
 */
function Field({
  label,
  children,
  required,
  error,
  errorId,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
  errorId?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-rose-500">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {children}
      {errorId && <FieldError id={errorId} message={error} />}
    </label>
  );
}

const WEIGHT_ROWS: {
  key: keyof ScoringWeights;
  label: string;
  hint: string;
  accent: string;
  bar: string;
}[] = [
  { key: 'skills', label: 'Skills match', hint: 'required & nice-to-have skills', accent: 'text-blue-600', bar: 'accent-blue-600' },
  { key: 'experience', label: 'Experience', hint: 'relevance, depth & seniority', accent: 'text-violet-600', bar: 'accent-violet-600' },
  { key: 'education', label: 'Education', hint: 'qualifications vs requirement', accent: 'text-amber-600', bar: 'accent-amber-600' },
  { key: 'quiz', label: 'Quiz / exam', hint: 'screening exam result', accent: 'text-emerald-600', bar: 'accent-emerald-600' },
];

/** Four sliders that set the per-job ranking weights, with a live "effective %" readout. */
function WeightsEditor({
  value,
  onChange,
  hasQuiz,
  error,
  errorId,
}: {
  value: ScoringWeights;
  onChange: (w: ScoringWeights) => void;
  hasQuiz: boolean;
  error?: string;
  errorId?: string;
}) {
  const total = WEIGHT_ROWS.reduce((sum, r) => sum + (value[r.key] || 0), 0);
  const isDefault = WEIGHT_ROWS.every((r) => value[r.key] === DEFAULT_SCORING_WEIGHTS[r.key]);

  return (
    <div
      className={`rounded-xl border bg-slate-50/60 p-4 ${error ? 'border-rose-300' : 'border-slate-200'}`}
      role="group"
      aria-describedby={error && errorId ? errorId : undefined}
    >
      <div className="space-y-3.5">
        {WEIGHT_ROWS.map((r) => {
          const raw = value[r.key] || 0;
          const effective = total > 0 ? Math.round((raw / total) * 100) : 0;
          const inactive = r.key === 'quiz' && !hasQuiz;
          return (
            <div key={r.key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {r.label}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">· {r.hint}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${inactive ? 'text-slate-400' : r.accent}`}>
                  {inactive ? 'no exam' : `${effective}%`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={raw}
                onChange={(e) => onChange({ ...value, [r.key]: Number(e.target.value) })}
                className={`h-1.5 w-full cursor-pointer ${r.bar}`}
                aria-label={`${r.label} weight`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
        <p className="text-xs text-slate-500">
          {total === 0
            ? 'Set at least one weight above zero.'
            : hasQuiz
              ? 'Percentages show each factor’s share of the overall score.'
              : 'Add a quiz to include exam results in the score.'}
        </p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_SCORING_WEIGHTS)}
          disabled={isDefault}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          <LuRotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
      {errorId && <FieldError id={errorId} message={error} />}
    </div>
  );
}
