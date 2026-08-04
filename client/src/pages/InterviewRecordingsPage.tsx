import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBot,
  LuCirclePlay,
  LuClock,
  LuFileText,
  LuSearch,
  LuVideo,
  LuVideoOff,
  LuX,
} from 'react-icons/lu';
import {
  fetchAiInterviewSessions,
  fetchAiRecordingUrl,
  fetchJobs,
  type AiInterviewSessionSummary,
} from '../api/endpoints';
import type { JobSummary } from '../api/types';
import { Alert, Card, Spinner } from '../components/ui';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Not started', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  live: { label: 'In progress', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  recording: { label: 'In progress', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  processing: { label: 'Processing', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' },
  ready: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
};

const REC_CLS: Record<string, string> = {
  advance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  reject: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

function duration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

/**
 * Library of every AI voice interview, so recruiters can review recordings in one place
 * instead of opening candidates one at a time.
 */
export default function InterviewRecordingsPage() {
  const [sessions, setSessions] = useState<AiInterviewSessionSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState('');
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('');

  // Player
  const [playing, setPlaying] = useState<AiInterviewSessionSummary | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs()
      .then((r) => setJobs(r.jobs))
      .catch(() => {
        /* filter is optional */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Debounce the free-text search so typing doesn't hammer the API.
    const t = setTimeout(() => {
      // This page is the video library: only interviews with a saved recording belong here.
      fetchAiInterviewSessions({
        q: q || undefined,
        jobId: jobId || undefined,
        status: status || undefined,
        hasRecording: true,
      })
        .then((r) => {
          setSessions(r.sessions);
          setRecordingEnabled(r.recordingEnabled);
        })
        .catch((err) =>
          setError(
            err instanceof Error && /not_configured/.test(err.message)
              ? 'AI voice interviews are not configured on the server yet.'
              : 'Could not load interview recordings.',
          ),
        )
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, jobId, status]);

  async function play(s: AiInterviewSessionSummary) {
    setPlaying(s);
    setVideoUrl(null);
    setVideoError(null);
    try {
      const { url } = await fetchAiRecordingUrl(s.id);
      setVideoUrl(url);
    } catch (err) {
      setVideoError(
        err instanceof Error && /no_recording/.test(err.message)
          ? 'No recording was saved for this interview.'
          : 'Could not open this recording.',
      );
    }
  }

  const stats = useMemo(
    () => ({
      total: sessions.length,
      scored: sessions.filter((s) => s.aiSummary).length,
    }),
    [sessions],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <LuVideo className="h-5 w-5 text-brand-500" />
          Interview recordings
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Every AI voice interview in one place — watch the call, read the transcript, and see how
          the candidate scored.
        </p>
      </div>

      {!recordingEnabled && (
        <Alert kind="info">
          Video recording isn&apos;t enabled on the server, so interviews here will have transcripts
          and AI scoring but no playback. Set the <code>AI_RECORDING_S3_*</code> variables to store
          recordings.
        </Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <LuSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search recordings by candidate"
            value={q}
            maxLength={120}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by candidate name or email…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          aria-label="Filter by role"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className={`${inputCls} w-auto`}
        >
          <option value="">All roles</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${inputCls} w-auto`}
        >
          <option value="">Any status</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="live">In progress</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {!loading && sessions.length > 0 && (
        <p className="text-xs text-slate-400">
          {stats.total} recording{stats.total === 1 ? '' : 's'} · {stats.scored} scored
        </p>
      )}

      {loading ? (
        <Spinner label="Loading recordings…" />
      ) : sessions.length === 0 ? (
        <Card className="p-10 text-center">
          <LuVideoOff className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            {q || jobId || status ? 'No recordings match these filters.' : 'No interview recordings yet.'}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {q || jobId || status
              ? 'Try clearing the search or filters.'
              : 'Recordings appear here once a candidate completes an AI voice interview.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => {
            const meta = STATUS_META[s.status] ?? STATUS_META.pending!;
            const score = s.aiSummary?.score;
            return (
              <Card key={s.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/hr/candidates/${s.candidateId}`}
                      className="truncate text-sm font-semibold text-slate-800 hover:text-brand-600 dark:text-slate-100"
                    >
                      {s.candidateName ?? 'Candidate'}
                    </Link>
                    <p className="truncate text-xs text-slate-500">{s.jobTitle ?? 'Role'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span>{when(s.startedAt ?? s.scheduledAt ?? s.createdAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    <LuClock className="h-3 w-3" />
                    {duration(s.durationSeconds)}
                  </span>
                  {s.transcriptTurns > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <LuFileText className="h-3 w-3" />
                      {s.transcriptTurns} turns
                    </span>
                  )}
                </div>

                {s.aiSummary && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-base font-bold text-slate-800 dark:text-slate-100">{score}</span>
                    <span className="text-[11px] text-slate-400">/ 100</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        REC_CLS[s.aiSummary.recommendation] ?? ''
                      }`}
                    >
                      {s.aiSummary.recommendation}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void play(s)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
                  >
                    <LuCirclePlay className="h-3.5 w-3.5" />
                    Watch
                  </button>
                  <Link
                    to={`/hr/candidates/${s.candidateId}`}
                    className="ml-auto text-xs font-medium text-brand-600 hover:underline"
                  >
                    Open candidate →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Player overlay */}
      {playing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Interview recording for ${playing.candidateName ?? 'candidate'}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPlaying(null)}
        >
          <div
            className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {playing.candidateName ?? 'Candidate'}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {playing.jobTitle ?? 'Role'} · {when(playing.startedAt ?? playing.createdAt)} ·{' '}
                  {duration(playing.durationSeconds)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close recording"
                onClick={() => setPlaying(null)}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>

            {videoError ? (
              <Alert kind="error">{videoError}</Alert>
            ) : !videoUrl ? (
              <div className="py-10">
                <Spinner label="Opening recording…" />
              </div>
            ) : (
              <video
                controls
                autoPlay
                src={videoUrl}
                className="w-full rounded-lg bg-black"
                style={{ aspectRatio: '16 / 9' }}
              />
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <LuBot className="h-3.5 w-3.5" />
                Conducted by the AI interviewer
              </span>
              <Link
                to={`/hr/candidates/${playing.candidateId}`}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Transcript &amp; scoring →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
