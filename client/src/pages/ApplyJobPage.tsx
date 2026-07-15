import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchPublicJob, submitApplication } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { PublicJob, QuizAnswer } from '../api/types';
import { Alert, Card, Spinner } from '../components/ui';

export default function ApplyJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const source = searchParams.get('src') || searchParams.get('source') || 'direct';

  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jobId) return;
    fetchPublicJob(jobId)
      .then((res) => setJob(res.job))
      .catch((err) =>
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? 'This position is no longer accepting applications.'
            : 'Could not load this position. Is the API running?',
        ),
      )
      .finally(() => setLoading(false));
  }, [jobId]);

  const quiz = job?.quiz ?? [];
  const totalPoints = useMemo(() => quiz.reduce((s, q) => s + q.points, 0), [quiz]);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!/\.(pdf|docx?|txt)$/i.test(f.name)) {
      setError('Please upload a PDF, DOCX, or TXT file.');
      return;
    }
    setFile(f);
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
    if (!file) return setError('Please attach your CV.');
    if (!jobId) return;

    const quizAnswers: QuizAnswer[] = quiz.map(
      (q) => answers[q.id] ?? { questionId: q.id },
    );

    const form = new FormData();
    form.append('jobId', jobId);
    form.append('fullName', fullName);
    form.append('email', email);
    if (phone) form.append('phone', phone);
    form.append('source', source);
    form.append('quizAnswers', JSON.stringify(quizAnswers));
    form.append('cv', file);

    setSubmitting(true);
    try {
      const res = await submitApplication(form);
      setTrackingToken(res.trackingToken);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/apply" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              CV
            </div>
            <span className="font-semibold text-slate-800">ScreenAI Careers</span>
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-600 hover:underline">
            Recruiter login
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {loading ? (
          <Spinner label="Loading position…" />
        ) : loadError ? (
          <Alert kind="error">{loadError}</Alert>
        ) : done ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Application received</h2>
            <p className="mx-auto mt-2 max-w-md text-slate-500">
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
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                {job.department && <span>{job.department}</span>}
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
              <h2 className="text-sm font-semibold text-slate-800">Your details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Jane Doe" />
                </Field>
                <Field label="Email">
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="jane@example.com" />
                </Field>
              </div>
              <Field label="Phone (optional)">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+1 555 123 4567" />
              </Field>
              <Field label="CV / Resume">
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
                  <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                  {file ? (
                    <p className="text-sm font-medium text-slate-700">{file.name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-600">Drop your CV here or click to browse</p>
                      <p className="mt-1 text-xs text-slate-400">PDF, DOCX or TXT, up to 10&nbsp;MB</p>
                    </>
                  )}
                </div>
              </Field>
            </Card>

            {/* Quiz / exam */}
            {quiz.length > 0 && (
              <Card className="space-y-5 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Screening exam</h2>
                  <span className="text-xs text-slate-400">{quiz.length} questions · {totalPoints} points</span>
                </div>
                {quiz.map((q, i) => (
                  <div key={q.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      {i + 1}. {q.prompt}
                      <span className="ml-2 text-xs font-normal text-slate-400">
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

            {error && <Alert kind="error">{error}</Alert>}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}