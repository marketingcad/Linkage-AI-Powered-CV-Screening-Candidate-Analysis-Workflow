import { useEffect, useState } from 'react';
import { LuBot, LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { fetchAiInterviewSession, type AiInterviewSession } from '../api/endpoints';

const STATUS_LABEL: Record<AiInterviewSession['status'], string> = {
  pending: 'Not started',
  live: 'In progress',
  recording: 'In progress',
  processing: 'Processing…',
  ready: 'Ready',
  failed: 'Failed',
};

const REC_CLS: Record<string, string> = {
  advance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  reject: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

const RATING_LABEL: Record<number, string> = {
  0: 'Not assessed — no usable evidence',
  1: 'Well below requirement',
  2: 'Below — no concrete personal contribution',
  3: 'Meets — real example, clear action, plausible outcome',
  4: 'Strong — measurable outcome and sound tradeoffs',
  5: 'Exceptional — depth and judgement',
};

/** 1–5 anchored rating. 0 renders as "not assessed" rather than a low score. */
function RatingPips({ rating }: { rating: number }) {
  const label = RATING_LABEL[rating] ?? '';
  if (rating < 1) {
    return (
      <span title={label} className="shrink-0 text-[11px] italic text-slate-600">
        not assessed
      </span>
    );
  }
  return (
    <span title={label} aria-label={`${rating} out of 5 — ${label}`} className="flex shrink-0 items-center gap-1">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-3 rounded-full ${
              n <= rating
                ? rating >= 4
                  ? 'bg-emerald-500'
                  : rating === 3
                    ? 'bg-brand-500'
                    : 'bg-amber-500'
                : 'bg-slate-200 dark:bg-slate-700'
            }`}
          />
        ))}
      </span>
      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-600">{rating}/5</span>
    </span>
  );
}

/** HR review of a finished AI voice interview: summary, recording, transcript. */
export default function AiInterviewResult({ interviewId }: { interviewId: string }) {
  const [session, setSession] = useState<AiInterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAiInterviewSession(interviewId)
      .then((r) => active && setSession(r.session))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [interviewId]);

  if (loading) return <p className="mt-1.5 text-xs text-slate-600">Loading AI results…</p>;
  if (!session) return <p className="mt-1.5 text-xs text-slate-600">No AI interview session yet.</p>;

  const s = session;
  const sum = s.aiSummary;

  return (
    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-sm dark:border-violet-900/50 dark:bg-violet-950/20">
      <div className="mb-2 flex items-center gap-2">
        <LuBot className="h-4 w-4 text-violet-500" />
        <span className="font-medium text-violet-800 dark:text-violet-300">AI interview</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {STATUS_LABEL[s.status]}
        </span>
        {s.durationSeconds != null && (
          <span className="text-[11px] text-slate-600">{Math.round(s.durationSeconds / 60)} min</span>
        )}
      </div>

      {/* Advisory only — context for the reviewer, not a verdict. A second device defeats
          this entirely, and leaving the tab has innocent explanations. */}
      {!!s.tabAwayCount && s.tabAwayCount > 0 && (
        <p
          title="Recorded from the candidate's browser. This is context, not evidence — watch the recording before drawing conclusions."
          className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
        >
          Left the interview tab {s.tabAwayCount}×
          {s.tabAwaySeconds ? ` (${Math.round(s.tabAwaySeconds)}s total)` : ''} — worth a look in
          the recording.
        </p>
      )}

      {sum && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{sum.score}</span>
            <span className="text-xs text-slate-600">/ 100 (AI interview)</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${REC_CLS[sum.recommendation] ?? ''}`}>
              {sum.recommendation}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-300">{sum.overview}</p>

          {sum.competencies && sum.competencies.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-600">
                Competency ratings
              </p>
              <ul className="space-y-1.5">
                {sum.competencies.map((c, i) => (
                  <li key={i} className="rounded-md bg-white/60 p-2 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        {c.competency}
                      </span>
                      <RatingPips rating={c.rating} />
                    </div>
                    {c.evidence && (
                      <p className="mt-0.5 text-[11px] italic text-slate-600 dark:text-slate-600">
                        “{c.evidence}”
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-slate-600">
                1 = well below · 3 = meets · 5 = exceptional. The score above is the average of
                the assessed areas.
              </p>
            </div>
          )}
          {sum.strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Strengths</p>
              <ul className="ml-4 list-disc text-xs text-slate-600 dark:text-slate-300">
                {sum.strengths.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          {sum.concerns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Concerns</p>
              <ul className="ml-4 list-disc text-xs text-slate-600 dark:text-slate-300">
                {sum.concerns.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {s.recordingUrl && (
        <video
          controls
          src={s.recordingUrl}
          className="mt-2 w-full max-w-md rounded-lg bg-black"
          style={{ aspectRatio: '16 / 9' }}
        />
      )}

      {s.transcript && s.transcript.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300"
          >
            {showTranscript ? <LuChevronDown className="h-3.5 w-3.5" /> : <LuChevronRight className="h-3.5 w-3.5" />}
            Transcript ({s.transcript.length} turns)
          </button>
          {showTranscript && (
            <div className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto rounded-lg bg-white/60 p-2 text-xs dark:bg-slate-900/40">
              {s.transcript.map((t, i) => (
                <p key={i}>
                  <span className={t.role === 'agent' ? 'font-semibold text-violet-600' : 'font-semibold text-slate-700 dark:text-slate-200'}>
                    {t.role === 'agent' ? 'Robin' : 'Candidate'}:
                  </span>{' '}
                  <span className="text-slate-600 dark:text-slate-300">{t.text}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {!sum && !s.recordingUrl && (!s.transcript || s.transcript.length === 0) && (
        <p className="text-xs text-slate-600">
          {s.status === 'ready' ? 'Interview finished; no summary was produced.' : 'Waiting for the interview to complete…'}
        </p>
      )}
    </div>
  );
}
