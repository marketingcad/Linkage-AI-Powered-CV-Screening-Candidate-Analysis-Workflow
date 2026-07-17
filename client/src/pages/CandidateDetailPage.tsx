import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LuArrowLeft,
  LuDownload,
  LuEllipsisVertical,
  LuFileJson,
  LuFileText,
  LuRefreshCw,
  LuTrash2,
  LuTriangleAlert,
} from 'react-icons/lu';
import {
  deleteCandidate,
  fetchCandidate,
  fetchCandidateEmails,
  reanalyzeCandidate,
  resendCandidateEmail,
  updateCandidateStage,
} from '../api/endpoints';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { API_BASE, getToken } from '../api/client';
import type {
  Candidate,
  CandidateStage,
  DuplicateApplication,
  EmailLog,
  Job,
  QuizAnswer,
  QuizQuestionResult,
} from '../api/types';
import {
  AiWrittenBadge,
  aiLevel,
  Alert,
  Button,
  Card,
  RecommendationBadge,
  ScoreRing,
  scoreBg,
  SourceBadge,
  Spinner,
  StageBadge,
  STAGE_ICONS,
  STAGES,
} from '../components/ui';

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [resending, setResending] = useState<'confirmation' | 'status' | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  function loadEmails() {
    if (!id) return;
    fetchCandidateEmails(id)
      .then((res) => setEmails(res.emails))
      .catch(() => {
        /* non-critical */
      });
  }

  function load() {
    if (!id) return;
    setLoading(true);
    fetchCandidate(id)
      .then((res) => {
        setCandidate(res.candidate);
        setJob(res.job);
        setDuplicates(res.duplicates ?? []);
      })
      .catch(() => setError('Failed to load candidate.'))
      .finally(() => setLoading(false));
    loadEmails();
  }

  useEffect(load, [id]);

  async function resend(type: 'confirmation' | 'status') {
    if (!candidate) return;
    setResending(type);
    setResendNote(null);
    try {
      const { result } = await resendCandidateEmail(candidate.id, type);
      setResendNote(
        result.sent
          ? 'Email sent.'
          : result.skipped
            ? 'Logged (SMTP not configured — configure SMTP to actually send).'
            : `Failed: ${result.error ?? 'unknown error'}`,
      );
      loadEmails();
    } catch {
      setResendNote('Failed to resend.');
    } finally {
      setResending(null);
    }
  }

  async function changeStage(stage: CandidateStage) {
    if (!candidate) return;
    setBusy(true);
    try {
      const res = await updateCandidateStage(candidate.id, stage);
      setCandidate((c) => (c ? { ...c, stage: res.candidate.stage } : c));
    } finally {
      setBusy(false);
    }
  }

  async function reanalyze() {
    if (!candidate) return;
    setBusy(true);
    try {
      const res = await reanalyzeCandidate(candidate.id);
      setCandidate(res.candidate);
    } catch {
      setError('Re-analysis failed.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadCv() {
    if (!candidate) return;
    const res = await fetch(`${API_BASE}/candidates/${candidate.id}/cv`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = candidate.cvFilename ?? 'cv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // GDPR: permanently erase this candidate (row + stored CV) on request.
  async function handleDelete() {
    if (!candidate) return;
    if (
      !confirm(
        `Permanently delete ${candidate.fullName}? This removes their record and CV and cannot be undone.`,
      )
    )
      return;
    await deleteCandidate(candidate.id);
    navigate('/hr/candidates');
  }

  if (loading) return <Spinner label="Loading candidate…" />;
  if (error || !candidate) return <Alert kind="error">{error ?? 'Candidate not found.'}</Alert>;

  const c = candidate;

  return (
    <div className="animate-rise space-y-6">
      <Link
        to="/hr/candidates"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
      >
        <LuArrowLeft className="h-4 w-4" />
        Back to candidates
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={c.overallScore ?? c.qualificationScore} size={72} />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{c.fullName}</h1>
            <p className="text-sm text-slate-500">
              {c.email}
              {c.phone ? ` · ${c.phone}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RecommendationBadge value={c.recommendation} />
              <StageBadge value={c.stage} />
              <SourceBadge source={c.source} />
              {c.aiLikelihood != null && <AiWrittenBadge likelihood={c.aiLikelihood} />}
              {job && (
                <Link
                  to={`/hr/jobs/${job.id}`}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  {job.title}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/hr/candidates/${c.id}/report`, '_blank')}
          >
            <LuFileText className="h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCv} disabled={!c.cvStoragePath}>
            <LuDownload className="h-4 w-4" />
            Download CV
          </Button>
          <Button variant="outline" size="sm" onClick={reanalyze} disabled={busy}>
            <LuRefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            Re-run AI
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 data-[state=open]:border-brand-300 data-[state=open]:bg-brand-50 data-[state=open]:text-brand-600"
              >
                <LuEllipsisVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => window.open(`/hr/candidates/${c.id}/data`, '_blank')}
              >
                <LuFileJson className="text-slate-500" />
                Export personal data
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete()}>
                <LuTrash2 />
                Delete candidate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {c.analysisStatus === 'failed' && (
        <Alert kind="error">
          AI analysis failed{c.analysisError ? `: ${c.analysisError}` : ''}. Try “Re-run AI”.
        </Alert>
      )}
      {c.analysisStatus === 'processing' && <Alert kind="info">Analysis in progress…</Alert>}

      {duplicates.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <LuTriangleAlert className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                Possible re-applicant — this email applied to {duplicates.length} other role
                {duplicates.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-2 space-y-1">
                {duplicates.map((d) => (
                  <li key={d.id} className="text-sm text-slate-600">
                    <Link
                      to={`/hr/candidates/${d.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {d.jobTitle ?? 'Untitled role'}
                    </Link>
                    <span className="text-slate-500">
                      {' · '}
                      {d.stage}
                      {(d.overallScore ?? d.qualificationScore) != null &&
                        ` · score ${d.overallScore ?? d.qualificationScore}`}
                      {` · ${new Date(d.createdAt).toLocaleDateString()}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Stage controls */}
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <span className="mr-1 text-sm font-medium text-slate-600">Move to:</span>
        {STAGES.map((s) => {
          const Icon = STAGE_ICONS[s];
          const active = c.stage === s;
          return (
            <button
              key={s}
              type="button"
              disabled={busy || active}
              onClick={() => changeStage(s)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                active
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {s}
            </button>
          );
        })}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: AI evaluation */}
        <div className="space-y-6 lg:col-span-2">
          {c.summary && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">AI summary</h2>
              <p className="text-sm leading-relaxed text-slate-600">{c.summary}</p>
            </Card>
          )}

          {c.aiLikelihood != null && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">CV authenticity check</h2>
                <AiWrittenBadge likelihood={c.aiLikelihood} size="md" />
              </div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-500">Estimated AI-generated</span>
                <span className="font-semibold text-slate-700">{c.aiLikelihood}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    aiLevel(c.aiLikelihood).tone === 'high'
                      ? 'bg-rose-500'
                      : aiLevel(c.aiLikelihood).tone === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${c.aiLikelihood}%` }}
                />
              </div>
              {c.aiSignals && c.aiSignals.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {c.aiSignals.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-600">
                      <span className="text-slate-400">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-400">
                Heuristic estimate from writing style — not a definitive detector. Use as one signal
                alongside the interview and exam.
              </p>
            </Card>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <ListCard title="Strengths" items={c.strengths} tone="positive" empty="No strengths recorded." />
            <ListCard title="Concerns / gaps" items={c.concerns} tone="negative" empty="No concerns recorded." />
          </div>

          {c.skillMatches && c.skillMatches.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Skills match</h2>
              <div className="space-y-2">
                {c.skillMatches.map((m) => (
                  <div key={m.skill} className="flex items-start gap-2 text-sm">
                    <span className={m.matched ? 'text-emerald-600' : 'text-rose-500'}>
                      {m.matched ? '✓' : '✕'}
                    </span>
                    <div>
                      <span className="font-medium text-slate-700">{m.skill}</span>
                      {m.evidence && <span className="text-slate-500"> — {m.evidence}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {c.extractedExperience && c.extractedExperience.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Experience</h2>
              <div className="space-y-4">
                {c.extractedExperience.map((exp, i) => (
                  <div key={i} className="border-l-2 border-slate-100 pl-3">
                    <p className="text-sm font-medium text-slate-800">
                      {exp.title} {exp.company ? `· ${exp.company}` : ''}
                    </p>
                    {(exp.startDate || exp.endDate) && (
                      <p className="text-xs text-slate-400">
                        {exp.startDate ?? '?'} – {exp.endDate ?? 'Present'}
                      </p>
                    )}
                    {exp.summary && <p className="mt-1 text-sm text-slate-600">{exp.summary}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {c.quizResults && c.quizResults.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Exam results</h2>
                {c.quizScore != null && (
                  <span className="text-xs font-medium text-slate-500">{c.quizScore}/100</span>
                )}
              </div>
              <div className="space-y-4">
                {c.quizResults.map((r, i) => (
                  <div key={r.questionId} className="border-l-2 border-slate-100 pl-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        {i + 1}. {r.prompt}
                      </p>
                      <span
                        className={`shrink-0 rounded px-1.5 text-xs font-semibold ${
                          r.awarded >= r.points
                            ? 'bg-emerald-100 text-emerald-700'
                            : r.awarded > 0
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {r.awarded}/{r.points}
                      </span>
                    </div>
                    <AnswerDisplay result={r} answers={c.quizAnswers} job={job} />
                    {r.feedback && (
                      <p className="mt-1 text-xs italic text-slate-500">AI: {r.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: extracted facts */}
        <div className="space-y-6">
          {(c.location ||
            c.currentTitle ||
            c.declaredYearsExperience != null ||
            c.linkedinUrl ||
            c.portfolioUrl ||
            c.noticePeriod ||
            c.expectedSalary ||
            c.coverNote) && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Applicant details</h2>
              <dl className="space-y-2.5 text-sm">
                <DetailRow label="Location" value={c.location} />
                <DetailRow label="Current title" value={c.currentTitle} />
                <DetailRow
                  label="Declared experience"
                  value={c.declaredYearsExperience != null ? `${c.declaredYearsExperience} yr` : null}
                />
                <DetailRow label="Notice period" value={c.noticePeriod} />
                <DetailRow label="Expected salary" value={c.expectedSalary} />
                <LinkRow label="LinkedIn" href={c.linkedinUrl} />
                <LinkRow label="Portfolio" href={c.portfolioUrl} />
              </dl>
              {c.coverNote && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Note</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{c.coverNote}</p>
                </div>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Scores</h2>
            <ScoreLine label="Overall" value={c.overallScore} />
            <ScoreLine label="CV qualification" value={c.qualificationScore} />
            <ScoreLine label="Skills match" value={c.skillsMatchScore} />
            {c.quizScore != null && <ScoreLine label="Quiz / exam" value={c.quizScore} />}
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-slate-500">Total experience</span>
              <span className="font-medium text-slate-700">
                {c.totalYearsExperience != null ? `${c.totalYearsExperience} yr` : '—'}
              </span>
            </div>
          </Card>

          {c.extractedSkills && c.extractedSkills.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Extracted skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {c.extractedSkills.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                    {s}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {c.extractedEducation && c.extractedEducation.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Education</h2>
              <div className="space-y-3">
                {c.extractedEducation.map((ed, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium text-slate-800">{ed.institution}</p>
                    <p className="text-xs text-slate-500">
                      {[ed.degree, ed.field, ed.year].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {c.extractedCertifications && c.extractedCertifications.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Certifications</h2>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                {c.extractedCertifications.map((cert, i) => (
                  <li key={i}>{cert}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Notifications / email log */}
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-700">Notifications</h2>
            <p className="mb-3 text-xs text-slate-400">Emails sent to {c.email}</p>

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => resend('confirmation')}
                disabled={resending !== null}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {resending === 'confirmation' ? 'Sending…' : 'Resend confirmation'}
              </button>
              <button
                type="button"
                onClick={() => resend('status')}
                disabled={resending !== null}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {resending === 'status' ? 'Sending…' : 'Send status update'}
              </button>
            </div>
            {resendNote && <p className="mb-3 text-xs text-slate-500">{resendNote}</p>}

            {emails.length === 0 ? (
              <p className="text-xs text-slate-400">No emails sent yet.</p>
            ) : (
              <ul className="space-y-2">
                {emails.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 text-xs">
                    <div>
                      <p className="font-medium text-slate-700">{e.subject}</p>
                      <p className="text-slate-400">{new Date(e.createdAt).toLocaleString()}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
                        e.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-700'
                          : e.status === 'skipped'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-rose-100 text-rose-700'
                      }`}
                      title={e.error ?? undefined}
                    >
                      {e.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AnswerDisplay({
  result,
  answers,
  job,
}: {
  result: QuizQuestionResult;
  answers: QuizAnswer[] | null;
  job: Job | null;
}) {
  const answer = answers?.find((a) => a.questionId === result.questionId);

  if (result.type === 'short') {
    return (
      <p className="mt-1 text-sm text-slate-600">
        {answer?.text ? answer.text : <span className="text-slate-400">No answer</span>}
      </p>
    );
  }

  const question = job?.quiz?.find((q) => q.id === result.questionId);
  const optionText = (id: string) =>
    question?.options?.find((o) => o.id === id)?.text ?? id;
  const selected = answer?.selectedOptionIds ?? [];
  const correct = question?.correctOptionIds ?? [];

  return (
    <div className="mt-1 space-y-0.5 text-sm">
      <p className="text-slate-600">
        Answered:{' '}
        {selected.length ? (
          selected.map((id) => optionText(id)).join(', ')
        ) : (
          <span className="text-slate-400">No answer</span>
        )}
      </p>
      {!result.correct && correct.length > 0 && (
        <p className="text-xs text-emerald-600">
          Correct: {correct.map((id) => optionText(id)).join(', ')}
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string | null }) {
  if (!href) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-600 hover:underline"
        >
          Open ↗
        </a>
      </dd>
    </div>
  );
}

function ListCard({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: string[] | null;
  tone: 'positive' | 'negative';
  empty: string;
}) {
  const marker = tone === 'positive' ? 'text-emerald-500' : 'text-amber-500';
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {items && items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600">
              <span className={marker}>•</span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">{empty}</p>
      )}
    </Card>
  );
}

function ScoreLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        <span className={`rounded px-1.5 text-xs font-semibold ${scoreBg(value)}`}>
          {value ?? '—'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            value == null
              ? 'bg-slate-300'
              : value >= 80
                ? 'bg-emerald-500'
                : value >= 60
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
          }`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}
