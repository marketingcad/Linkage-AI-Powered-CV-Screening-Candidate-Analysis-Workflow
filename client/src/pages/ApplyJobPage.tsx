import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LuCircleHelp, LuLockKeyhole } from 'react-icons/lu';
import { fetchPublicJob, prefillFromCv, submitApplication } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { PublicJob, QuizAnswer } from '../api/types';
import { Alert, Card, Spinner } from '../components/ui';
import FieldError from '../components/FieldError';
import { useFormErrors } from '../lib/useFormErrors';
import * as v from '../lib/validators';
import PublicHeader from '../layout/PublicHeader';

export default function ApplyJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const source = searchParams.get('src') || searchParams.get('source') || 'direct';

  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A real role that isn't open ('closed'), or a bad/expired link ('notfound').
  const [unavailable, setUnavailable] = useState<{ kind: 'closed' | 'notfound'; title?: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [coverNote, setCoverNote] = useState('');
  // Up to 3 candidate-proposed initial-interview slots (datetime-local strings).
  const [slots, setSlots] = useState<string[]>(['', '', '']);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [autofilled, setAutofilled] = useState(false);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useFormErrors('apply');
  const [done, setDone] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jobId) return;
    fetchPublicJob(jobId)
      .then((res) => {
        if (res.accepting) setJob(res.job);
        else setUnavailable({ kind: 'closed', title: res.job.title });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setUnavailable({ kind: 'notfound' });
        } else {
          setLoadError('Could not load this position. Is the API running?');
        }
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  const quiz = job?.quiz ?? [];
  const totalPoints = useMemo(() => quiz.reduce((s, q) => s + q.points, 0), [quiz]);
  // Earliest selectable slot (now), formatted for a datetime-local input.
  const minLocal = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  function pickFile(f: File | null) {
    setError(null);
    fieldErrors.clearError('cv');
    setAutofilled(false);
    if (!f) return setFile(null);
    // Check type *and* size here (the form advertises a 10 MB limit) so a huge file
    // fails instantly instead of after a long upload the server then rejects.
    const problem = v.fileRules(f, { maxMb: 10, accept: /\.(pdf|docx)$/i, label: 'CV' });
    if (problem) {
      fieldErrors.validate({ cv: problem });
      return;
    }
    setFile(f);
    void autofillFromCv(f);
  }

  // Parse the CV and pre-fill fields (only where the applicant hasn't typed).
  async function autofillFromCv(f: File) {
    setPrefilling(true);
    try {
      const { details } = await prefillFromCv(f);
      // Functional updaters keep any value the applicant already typed.
      const fill = (setter: (fn: (v: string) => string) => void, val: string | null) => {
        if (val) setter((v) => (v.trim() ? v : val));
      };
      fill(setFullName, details.fullName);
      fill(setEmail, details.email);
      fill(setPhone, details.phone);
      fill(setLocation, details.location);
      fill(setCurrentTitle, details.currentTitle);
      fill(setLinkedinUrl, details.linkedinUrl);
      fill(setPortfolioUrl, details.portfolioUrl);
      if (details.yearsExperience != null) {
        setYearsExperience((v) => (v.trim() ? v : String(details.yearsExperience)));
      }
      const filledAny = [
        [details.fullName, fullName],
        [details.email, email],
        [details.phone, phone],
        [details.location, location],
        [details.currentTitle, currentTitle],
        [details.linkedinUrl, linkedinUrl],
        [details.portfolioUrl, portfolioUrl],
      ].some(([val, cur]) => !!val && !String(cur).trim());
      setAutofilled(filledAny || (details.yearsExperience != null && !yearsExperience.trim()));
    } catch {
      /* autofill is best-effort — applicant can fill manually */
    } finally {
      setPrefilling(false);
    }
  }

  function setChoice(qid: string, optionId: string, multiple: boolean) {
    setAnswers((prev) => {
      const existing = prev[qid]?.selectedOptionIds ?? [];
      let selected: string[];
      if (multiple) {
        selected = existing.includes(optionId)
          ? existing.filter((id) => id !== optionId)
          : [...existing, optionId];
      } else {
        selected = [optionId];
      }
      return { ...prev, [qid]: { questionId: qid, selectedOptionIds: selected } };
    });
  }

  function setShort(qid: string, text: string) {
    setAnswers((prev) => ({ ...prev, [qid]: { questionId: qid, text } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!jobId) return;

    // Validate every field up front so the applicant sees all problems at once,
    // inline on the offending field, instead of one banner per round-trip.
    const slotErrors: Record<string, string | undefined> = {};
    slots.forEach((s, i) => {
      if (s.trim()) {
        slotErrors[`slot${i}`] = v.dateTime(s, { label: 'Preferred time', allowPast: false });
      }
    });
    const filledSlots = slots.map((s) => s.trim()).filter(Boolean);
    if (new Set(filledSlots).size !== filledSlots.length) {
      slotErrors.slot0 = 'Preferred times must be different from each other.';
    }

    const ok = fieldErrors.validate({
      cv: v.fileRules(file, { maxMb: 10, accept: /\.(pdf|docx)$/i, label: 'CV' }),
      fullName:
        v.required(fullName, 'Full name') ??
        v.minLen(fullName, 2, 'Full name') ??
        v.maxLen(fullName, v.LIMITS.fullName, 'Full name'),
      email: v.email(email),
      phone: v.phone(phone),
      location: v.maxLen(location, v.LIMITS.location, 'Location'),
      currentTitle: v.maxLen(currentTitle, v.LIMITS.currentTitle, 'Current title'),
      yearsExperience: v.intInRange(yearsExperience, { min: 0, max: 60, label: 'Years of experience' }),
      linkedinUrl: v.httpUrl(linkedinUrl, 'LinkedIn URL'),
      portfolioUrl: v.httpUrl(portfolioUrl, 'Portfolio URL'),
      noticePeriod: v.maxLen(noticePeriod, v.LIMITS.noticePeriod, 'Notice period'),
      expectedSalary: v.maxLen(expectedSalary, v.LIMITS.expectedSalary, 'Expected salary'),
      coverNote: v.maxLen(coverNote, v.LIMITS.coverNote, 'Cover note'),
      ...slotErrors,
    });
    if (!ok || !file) return;

    const quizAnswers: QuizAnswer[] = quiz.map(
      (q) => answers[q.id] ?? { questionId: q.id },
    );

    const form = new FormData();
    form.append('jobId', jobId);
    form.append('fullName', fullName);
    form.append('email', email);
    if (phone) form.append('phone', phone);
    if (location) form.append('location', location);
    if (currentTitle) form.append('currentTitle', currentTitle);
    if (yearsExperience) form.append('declaredYearsExperience', yearsExperience);
    if (linkedinUrl) form.append('linkedinUrl', linkedinUrl);
    if (portfolioUrl) form.append('portfolioUrl', portfolioUrl);
    if (noticePeriod) form.append('noticePeriod', noticePeriod);
    if (expectedSalary) form.append('expectedSalary', expectedSalary);
    if (coverNote) form.append('coverNote', coverNote);
    // Convert filled datetime-local slots (local time) to ISO, keep order, drop blanks.
    // Guarded: an unparseable value used to throw here — outside the try below — which
    // left the form permanently stuck with the submit button disabled.
    const availabilitySlots = slots
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      })
      .filter((s): s is string => s !== null);
    if (availabilitySlots.length) {
      form.append('availabilitySlots', JSON.stringify(availabilitySlots));
      // Capture the applicant's timezone so recruiters can read the slots in the
      // candidate's own local time rather than guessing.
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) form.append('timezone', tz);
      } catch {
        /* timezone is best-effort */
      }
    }
    form.append('source', source);
    form.append('quizAnswers', JSON.stringify(quizAnswers));
    form.append('cv', file);

    setSubmitting(true);
    try {
      const res = await submitApplication(form);
      setTrackingToken(res.trackingToken);
      setDone(true);
    } catch (err) {
      // Field-level details from the server land on their fields; anything else
      // becomes the form-level message.
      fieldErrors.setServerError(err, 'Submission failed. Please try again.');
      setError(err instanceof ApiError ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <PublicHeader container="max-w-4xl" />

      <div className="mx-auto max-w-4xl px-6 py-10">
        {loading ? (
          <Spinner label="Loading position…" />
        ) : unavailable ? (
          <Card className="mx-auto max-w-lg p-10 text-center">
            <div
              className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                unavailable.kind === 'closed'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {unavailable.kind === 'closed' ? (
                <LuLockKeyhole className="h-6 w-6" />
              ) : (
                <LuCircleHelp className="h-6 w-6" />
              )}
            </div>
            {unavailable.kind === 'closed' ? (
              <>
                <h1 className="font-display text-xl font-semibold text-slate-900">
                  Applications are closed
                </h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                  {unavailable.title ? (
                    <>
                      The <span className="font-medium text-slate-700">{unavailable.title}</span>{' '}
                      position is no longer accepting applications.
                    </>
                  ) : (
                    'This position is no longer accepting applications.'
                  )}{' '}
                  Thank you for your interest — please check back for future openings.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-display text-xl font-semibold text-slate-900">
                  Position not found
                </h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                  This application link may be invalid or has expired. Please double-check the link
                  from the job posting.
                </p>
              </>
            )}
          </Card>
        ) : loadError ? (
          <Alert kind="error">{loadError}</Alert>
        ) : done ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Application received</h2>
            <p className="mx-auto mt-2 max-w-md text-slate-600">
              Thanks, {fullName || 'candidate'}. Your CV{quiz.length > 0 ? ' and exam' : ''} have
              been received and shared with our recruiting team. We've emailed you a confirmation with
              a link to track your status.
            </p>
            {trackingToken && (
              <Link
                to={`/status/${trackingToken}`}
                className="mt-6 inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Track your application
              </Link>
            )}
          </Card>
        ) : job ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Job header */}
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{job.title}</h1>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                {job.department && <span>{job.department}</span>}
                {job.workArrangement && <span>· {job.workArrangement}</span>}
                {job.location && <span>· {job.location}</span>}
                {job.employmentType && <span>· {job.employmentType}</span>}
                {source !== 'direct' && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    via {source}
                  </span>
                )}
              </div>
            </div>

            <Card className="p-6">
              <p className="whitespace-pre-wrap text-sm text-slate-600">{job.description}</p>
              {job.requiredSkills.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {job.requiredSkills.map((s) => (
                    <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {/* Applicant details */}
            <Card className="space-y-4 p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">Your details</h2>
                {autofilled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    ✨ Autofilled from your CV — please review
                  </span>
                )}
              </div>

              {/* CV first — attaching it auto-fills the fields below */}
              <Field label="CV / Resume" required error={fieldErrors.errors.cv} errorId={fieldErrors.errorId('cv')}>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pickFile(e.dataTransfer.files[0] ?? null);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
                    dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400'
                  }`}
                >
                  <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                  {file ? (
                    <>
                      <p className="text-sm font-medium text-slate-700">{file.name}</p>
                      {prefilling ? (
                        <span className="mt-2 inline-flex items-center gap-2 text-xs text-brand-600">
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
                          Reading your CV to autofill…
                        </span>
                      ) : (
                        <p className="mt-1 text-xs text-slate-600">Click to replace</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-600">Drop your CV here or click to browse</p>
                      <p className="mt-1 text-xs text-slate-600">
                        PDF or DOCX only, up to 10&nbsp;MB · we'll autofill your details
                      </p>
                    </>
                  )}
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required error={fieldErrors.errors.fullName} errorId={fieldErrors.errorId('fullName')}>
                  <input
                    required
                    maxLength={v.LIMITS.fullName}
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); fieldErrors.clearError('fullName'); }}
                    className={inputCls}
                    placeholder="Jane Doe"
                    {...fieldErrors.fieldProps('fullName')}
                  />
                </Field>
                <Field label="Email" required error={fieldErrors.errors.email} errorId={fieldErrors.errorId('email')}>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    maxLength={v.LIMITS.email}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); fieldErrors.clearError('email'); }}
                    className={inputCls}
                    placeholder="jane@example.com"
                    {...fieldErrors.fieldProps('email')}
                  />
                </Field>
                <Field label="Phone" error={fieldErrors.errors.phone} errorId={fieldErrors.errorId('phone')}>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={v.LIMITS.phone}
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); fieldErrors.clearError('phone'); }}
                    className={inputCls}
                    placeholder="+1 555 123 4567"
                    {...fieldErrors.fieldProps('phone')}
                  />
                </Field>
                <Field label="Location" error={fieldErrors.errors.location} errorId={fieldErrors.errorId('location')}>
                  <input
                    maxLength={v.LIMITS.location}
                    value={location}
                    onChange={(e) => { setLocation(e.target.value); fieldErrors.clearError('location'); }}
                    className={inputCls}
                    placeholder="City, Country"
                    {...fieldErrors.fieldProps('location')}
                  />
                </Field>
                <Field label="Current / most recent title" error={fieldErrors.errors.currentTitle} errorId={fieldErrors.errorId('currentTitle')}>
                  <input
                    maxLength={v.LIMITS.currentTitle}
                    value={currentTitle}
                    onChange={(e) => { setCurrentTitle(e.target.value); fieldErrors.clearError('currentTitle'); }}
                    className={inputCls}
                    placeholder="Senior Frontend Engineer"
                    {...fieldErrors.fieldProps('currentTitle')}
                  />
                </Field>
                <Field label="Years of experience" error={fieldErrors.errors.yearsExperience} errorId={fieldErrors.errorId('yearsExperience')}>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={yearsExperience}
                    onChange={(e) => { setYearsExperience(e.target.value); fieldErrors.clearError('yearsExperience'); }}
                    className={inputCls}
                    placeholder="5"
                    {...fieldErrors.fieldProps('yearsExperience')}
                  />
                </Field>
                <Field label="LinkedIn URL" error={fieldErrors.errors.linkedinUrl} errorId={fieldErrors.errorId('linkedinUrl')}>
                  <input
                    type="url"
                    inputMode="url"
                    maxLength={v.LIMITS.url}
                    value={linkedinUrl}
                    onChange={(e) => { setLinkedinUrl(e.target.value); fieldErrors.clearError('linkedinUrl'); }}
                    className={inputCls}
                    placeholder="https://linkedin.com/in/…"
                    {...fieldErrors.fieldProps('linkedinUrl')}
                  />
                </Field>
                <Field label="Portfolio / GitHub URL" optional error={fieldErrors.errors.portfolioUrl} errorId={fieldErrors.errorId('portfolioUrl')}>
                  <input
                    type="url"
                    inputMode="url"
                    maxLength={v.LIMITS.url}
                    value={portfolioUrl}
                    onChange={(e) => { setPortfolioUrl(e.target.value); fieldErrors.clearError('portfolioUrl'); }}
                    className={inputCls}
                    placeholder="https://…"
                    {...fieldErrors.fieldProps('portfolioUrl')}
                  />
                </Field>
                <Field label="Notice period / availability" error={fieldErrors.errors.noticePeriod} errorId={fieldErrors.errorId('noticePeriod')}>
                  <input
                    maxLength={v.LIMITS.noticePeriod}
                    value={noticePeriod}
                    onChange={(e) => { setNoticePeriod(e.target.value); fieldErrors.clearError('noticePeriod'); }}
                    className={inputCls}
                    placeholder="e.g. Immediate, 2 weeks, 1 month"
                    {...fieldErrors.fieldProps('noticePeriod')}
                  />
                </Field>
                <Field label="Expected salary" error={fieldErrors.errors.expectedSalary} errorId={fieldErrors.errorId('expectedSalary')}>
                  <input
                    maxLength={v.LIMITS.expectedSalary}
                    value={expectedSalary}
                    onChange={(e) => { setExpectedSalary(e.target.value); fieldErrors.clearError('expectedSalary'); }}
                    className={inputCls}
                    placeholder="e.g. $90k, negotiable"
                    {...fieldErrors.fieldProps('expectedSalary')}
                  />
                </Field>
              </div>
              <Field label="Anything else you'd like us to know?" optional error={fieldErrors.errors.coverNote} errorId={fieldErrors.errorId('coverNote')}>
                <textarea
                  value={coverNote}
                  maxLength={v.LIMITS.coverNote}
                  onChange={(e) => { setCoverNote(e.target.value); fieldErrors.clearError('coverNote'); }}
                  rows={3}
                  className={inputCls}
                  placeholder="A short note or cover message…"
                  {...fieldErrors.fieldProps('coverNote')}
                />
                <span className="mt-1 block text-right text-xs text-slate-600">
                  {coverNote.length}/{v.LIMITS.coverNote}
                </span>
              </Field>
              <p className="text-xs text-slate-600">
                Only name, email, and CV are required — the rest help us evaluate you faster.
              </p>
            </Card>

            {/* Preferred interview times */}
            <Card className="space-y-4 p-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Preferred interview times</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Suggest up to 3 date &amp; time options that work for an initial interview. Optional —
                  it helps us schedule faster. Use your own local timezone.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {slots.map((val, i) => (
                  <Field key={i} label={`Option ${i + 1}`}>
                    <input
                      type="datetime-local"
                      value={val}
                      min={minLocal}
                      onChange={(e) =>
                        setSlots((prev) => prev.map((s, idx) => (idx === i ? e.target.value : s)))
                      }
                      className={inputCls}
                    />
                  </Field>
                ))}
              </div>
            </Card>

            {/* Quiz / exam */}
            {quiz.length > 0 && (
              <Card className="space-y-5 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Screening exam</h2>
                  <span className="text-xs text-slate-600">{quiz.length} questions · {totalPoints} points</span>
                </div>
                {quiz.map((q, i) => (
                  <div key={q.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      {i + 1}. {q.prompt}
                      <span className="ml-2 text-xs font-normal text-slate-600">
                        ({q.points} pt{q.points === 1 ? '' : 's'})
                      </span>
                    </p>
                    {q.type === 'short' ? (
                      <textarea
                        rows={3}
                        value={answers[q.id]?.text ?? ''}
                        onChange={(e) => setShort(q.id, e.target.value)}
                        className={inputCls}
                        placeholder="Your answer…"
                      />
                    ) : (
                      <div className="space-y-1.5">
                        {(q.options ?? []).map((o) => {
                          const selected = (answers[q.id]?.selectedOptionIds ?? []).includes(o.id);
                          return (
                            <label
                              key={o.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                                selected ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type={q.type === 'single' ? 'radio' : 'checkbox'}
                                name={q.id}
                                checked={selected}
                                onChange={() => setChoice(q.id, o.id, q.type === 'multiple')}
                                className="h-4 w-4 accent-brand-500"
                              />
                              <span className="text-slate-700">{o.text}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}

            {(error || fieldErrors.formError) && (
              <Alert kind="error">{error ?? fieldErrors.formError}</Alert>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? <Spinner label="Analyzing your application…" /> : 'Submit application'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

/**
 * Labelled field with a required marker and an inline error slot. The error is rendered
 * by FieldError and referenced from the input via aria-describedby (see useFormErrors).
 */
function Field({
  label,
  children,
  required,
  optional,
  error,
  errorId,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  /** Says so in the label. Read by screen readers too, so it is not colour/weight alone. */
  optional?: boolean;
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
        {optional && <span className="ml-1.5 font-normal text-slate-600">(optional)</span>}
      </span>
      {children}
      {errorId && <FieldError id={errorId} message={error} />}
    </label>
  );
}