import { useState } from 'react';
import { LuBriefcase, LuRotateCcw, LuScale, LuSparkles } from 'react-icons/lu';
import {
  createJob,
  generateQuiz,
  improveJobDescription,
  updateJob,
  type JobInput,
} from '../api/endpoints';
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
import SkillsInput from './SkillsInput';
import { useFormErrors } from '../lib/useFormErrors';
import * as v from '../lib/validators';
import QuizBuilder from './QuizBuilder';

/**
 * Fixed set of employment types. Free text produced inconsistent values ("Full-time",
 * "full time", "FT") that candidates then saw on the public listing and that made the
 * jobs list impossible to filter reliably.
 */
export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Temporary',
  'Internship',
  'Apprenticeship',
  'Freelance',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * How the role is worked. Separate from Location, which says *where* — "Remote" is not an
 * address, and a hybrid role still needs to name its city.
 */
export const WORK_ARRANGEMENTS = [
  'Onsite',
  'Hybrid',
  'Remote',
  'Remote (region-locked)',
  'Field / travel-based',
] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

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
  const [workArrangement, setWorkArrangement] = useState(existing?.workArrangement ?? '');
  const [employmentType, setEmploymentType] = useState(existing?.employmentType ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [requiredSkills, setRequiredSkills] = useState<string[]>(existing?.requiredSkills ?? []);
  const [niceToHaveSkills, setNiceToHaveSkills] = useState<string[]>(existing?.niceToHaveSkills ?? []);
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

  /**
   * The AI's proposed rewrite, held here until the recruiter accepts it. It is deliberately
   * not written straight into the textarea — this is a live job posting, and silently
   * replacing what someone wrote gives them no way back to their own words.
   */
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);

  async function handleImproveDescription() {
    setImproveError(null);
    setSuggestion(null);
    if (title.trim().length < 2) {
      setImproveError('Add a job title first so the rewrite has something to work from.');
      return;
    }
    if (description.trim().length < 20) {
      setImproveError('Write a few sentences first — the AI rewrites your description, it does not invent one.');
      return;
    }
    setImproving(true);
    try {
      const res = await improveJobDescription({
        title: title.trim(),
        description: description.trim(),
        department: department.trim() || null,
        location: location.trim() || null,
        workArrangement: workArrangement.trim() || null,
        employmentType: employmentType.trim() || null,
        requiredSkills,
        niceToHaveSkills,
        minYearsExperience: minYears ? Number(minYears) : null,
      });
      setSuggestion(res.description);
    } catch (err) {
      setImproveError(err instanceof ApiError ? err.message : 'Could not rewrite the description.');
    } finally {
      setImproving(false);
    }
  }

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
        requiredSkills,
        niceToHaveSkills,
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
      workArrangement: workArrangement.trim() ? undefined : 'Select a work arrangement.',
      employmentType: employmentType.trim() ? undefined : 'Select an employment type.',
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
      workArrangement: workArrangement.trim() || undefined,
      employmentType: employmentType.trim() || undefined,
      description: description.trim(),
      requiredSkills,
      niceToHaveSkills,
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
              <DialogDescription className="text-xs text-slate-600">
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

          {/* Two columns, not three: this row holds four fields since work arrangement was
              split out of location, and a 3-wide grid left Employment type alone on its own
              row. Paired 2x2 it reads as "where" then "how". */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" error={fieldErrors.errors.department} errorId={fieldErrors.errorId('department')}>
              <input
                maxLength={v.LIMITS.jobTitle}
                value={department}
                onChange={(e) => { setDepartment(e.target.value); fieldErrors.clearError('department'); }}
                className={inputCls}
                {...fieldErrors.fieldProps('department')}
              />
            </Field>
            <Field
              label="Work arrangement"
              required
              error={fieldErrors.errors.workArrangement}
              errorId={fieldErrors.errorId('workArrangement')}
            >
              <select
                value={workArrangement}
                onChange={(e) => { setWorkArrangement(e.target.value); fieldErrors.clearError('workArrangement'); }}
                className={inputCls}
                {...fieldErrors.fieldProps('workArrangement')}
              >
                <option value="">Select an arrangement…</option>
                {WORK_ARRANGEMENTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {/* Same guard as employment type: a job saved before this list existed keeps
                    its value as an option so editing it can't silently rewrite it. */}
                {workArrangement && !WORK_ARRANGEMENTS.includes(workArrangement as WorkArrangement) && (
                  <option value={workArrangement}>{workArrangement}</option>
                )}
              </select>
            </Field>
            <Field label="Location" error={fieldErrors.errors.location} errorId={fieldErrors.errorId('location')}>
              <input
                maxLength={v.LIMITS.location}
                value={location}
                onChange={(e) => { setLocation(e.target.value); fieldErrors.clearError('location'); }}
                className={inputCls}
                placeholder="City or region, e.g. Austin, TX"
                {...fieldErrors.fieldProps('location')}
              />
            </Field>
            <Field label="Employment type" required error={fieldErrors.errors.employmentType} errorId={fieldErrors.errorId('employmentType')}>
              <select
                value={employmentType}
                onChange={(e) => { setEmploymentType(e.target.value); fieldErrors.clearError('employmentType'); }}
                className={inputCls}
                {...fieldErrors.fieldProps('employmentType')}
              >
                <option value="">Select an employment type…</option>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {/* A job saved before this became a fixed list keeps its value as an option,
                    so editing an old job can't silently rewrite it. */}
                {employmentType && !EMPLOYMENT_TYPES.includes(employmentType as EmploymentType) && (
                  <option value={employmentType}>{employmentType}</option>
                )}
              </select>
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleImproveDescription}
                disabled={improving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <LuSparkles className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                {improving ? 'Rewriting…' : 'Improve description using AI'}
              </button>
              <span className="text-xs text-slate-600">
                Rewrites what you wrote — it won’t invent salary, benefits, or requirements.
              </span>
            </div>
            {improveError && (
              <div className="mt-2">
                <Alert kind="error">{improveError}</Alert>
              </div>
            )}
            {suggestion && (
              <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">Suggested rewrite</p>
                  <span className="text-xs text-slate-600">
                    {suggestion.trim().split(/\s+/).length} words
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg bg-white p-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{suggestion}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDescription(suggestion);
                      setSuggestion(null);
                      fieldErrors.clearError('description');
                    }}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600"
                  >
                    Use this
                  </button>
                  <button
                    type="button"
                    onClick={handleImproveDescription}
                    disabled={improving}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestion(null)}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </Field>

          <Field label="Required skills">
            <SkillsInput
              value={requiredSkills}
              onChange={setRequiredSkills}
              placeholder="e.g. React — then press Enter"
            />
          </Field>

          <Field label="Nice-to-have skills">
            <SkillsInput
              value={niceToHaveSkills}
              onChange={setNiceToHaveSkills}
              placeholder="e.g. GraphQL — then press Enter"
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
            <p className="mb-3 text-xs text-slate-600">
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
              <span className="text-xs text-slate-600">
                {quiz.length} question{quiz.length === 1 ? '' : 's'} · optional
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-600">
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
              <span className="text-xs text-slate-600">from the job details above</span>
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
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25';

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
                  <span className="ml-1.5 text-xs font-normal text-slate-600">· {r.hint}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${inactive ? 'text-slate-600' : r.accent}`}>
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
        <p className="text-xs text-slate-600">
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
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          <LuRotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
      {errorId && <FieldError id={errorId} message={error} />}
    </div>
  );
}
