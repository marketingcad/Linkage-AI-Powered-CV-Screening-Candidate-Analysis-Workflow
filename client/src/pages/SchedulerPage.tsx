import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBan,
  LuBot,
  LuCalendarClock,
  LuCalendarPlus,
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuClipboardCheck,
  LuMapPin,
  LuMonitor,
  LuPhone,
  LuStar,
  LuVideo,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { fetchHolidays, fetchInterviews, updateInterview } from '../api/endpoints';
import type { Interview, InterviewMode, InterviewStatus } from '../api/types';
import { Alert, Button, Card } from '../components/ui';
import { CardListSkeleton } from '../components/Skeletons';
import ScheduleInterviewDialog from '../components/ScheduleInterviewDialog';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODE_ICON: Record<InterviewMode, IconType> = {
  video: LuVideo,
  onsite: LuMapPin,
  phone: LuPhone,
  ai_voice: LuBot,
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const isSameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function relative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'Started';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `in ${days}d`;
}

/** 42 days (6 weeks) starting on the Sunday on/before the 1st of the view month. */
function calendarDays(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

type DialogState =
  | { kind: 'new'; defaultDate?: string }
  | { kind: 'edit'; interview: Interview }
  | null;

export default function SchedulerPage() {
  // Keyed yyyy-MM-dd → holiday name. Empty when the source is unreachable, which simply
  // means the calendar renders without them.
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());

  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  function load() {
    setLoading(true);
    fetchInterviews()
      .then((res) => setInterviews(res.interviews))
      .catch(() => setError('Failed to load the schedule.'))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  /*
   * Holidays for whichever year is on screen.
   *
   * Keyed on the year, not the month, so paging through a year costs one request. The grid
   * always shows a few days either side of the month, so the neighbouring years are fetched
   * too when sitting on January or December — otherwise those trailing days would be the only
   * ones silently missing their holidays.
   */
  useEffect(() => {
    const years = new Set(calendarDays(viewMonth).map((d) => d.getFullYear()));
    let live = true;
    Promise.all([...years].map((y) => fetchHolidays(y).catch(() => ({ holidays: [] }))))
      .then((results) => {
        if (!live) return;
        const map = new Map<string, string>();
        for (const r of results) for (const h of r.holidays) map.set(h.date, h.name);
        setHolidays(map);
      })
      // Decoration on a scheduling view — never worth an error banner.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [viewMonth]);

  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const iv of interviews) {
      const key = ymd(new Date(iv.scheduledAt));
      (map.get(key) ?? map.set(key, []).get(key)!).push(iv);
    }
    return map;
  }, [interviews]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return interviews
      .filter((iv) => iv.status === 'scheduled' && new Date(iv.scheduledAt).getTime() >= now)
      .slice(0, 8);
  }, [interviews]);

  // Interviews whose time has passed but are still marked "scheduled" — they need an outcome.
  const awaitingOutcome = useMemo(() => {
    const now = Date.now();
    return interviews
      .filter(
        (iv) =>
          iv.status === 'scheduled' &&
          new Date(iv.scheduledAt).getTime() + iv.durationMinutes * 60000 < now,
      )
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  }, [interviews]);

  const days = calendarDays(viewMonth);
  const today = new Date();

  function afterChange() {
    setDialog(null);
    load();
  }

  // Record an interview outcome inline (Completed / No-show), then refresh.
  async function markOutcome(iv: Interview, status: InterviewStatus) {
    setError(null);
    const prev = interviews;
    setInterviews((list) => list.map((x) => (x.id === iv.id ? { ...x, status } : x)));
    try {
      await updateInterview(iv.id, { status, notifyCandidate: false });
    } catch {
      setInterviews(prev);
      setError('Could not update the interview. Please try again.');
    }
  }

  return (
    <div className="animate-rise space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-[0_6px_16px_-6px_rgba(51,88,240,0.6)]">
            <LuCalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-900">Scheduler</h1>
            <p className="text-sm text-slate-600">
              Pin candidates to the calendar and get reminded before each interview.
            </p>
          </div>
        </div>
        <Button onClick={() => setDialog({ kind: 'new' })}>
          <LuCalendarPlus className="h-4 w-4" />
          New interview
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {awaitingOutcome.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600">
              <LuClipboardCheck className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800">Awaiting outcome</h2>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">
              {awaitingOutcome.length}
            </span>
          </div>
          <p className="mb-3 text-xs text-slate-600">
            These interviews have passed — record how they went, then add a scorecard.
          </p>
          <ul className="space-y-2">
            {awaitingOutcome.map((iv) => (
              <li
                key={iv.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-100 bg-white p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {iv.candidateName ?? 'Candidate'}
                  </p>
                  <p className="truncate text-xs text-slate-600">
                    {new Date(iv.scheduledAt).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {iv.jobTitle ? ` · ${iv.jobTitle}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void markOutcome(iv, 'completed')}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-200"
                  >
                    <LuCheck className="h-3.5 w-3.5" />
                    Completed
                  </button>
                  <button
                    type="button"
                    onClick={() => void markOutcome(iv, 'no_show')}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
                  >
                    <LuBan className="h-3.5 w-3.5" />
                    No-show
                  </button>
                  <Link
                    to={`/hr/candidates/${iv.candidateId}`}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
                  >
                    <LuStar className="h-3.5 w-3.5" />
                    Add rating
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="font-display text-lg font-semibold text-slate-800">
              {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                aria-label="Previous month"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <LuChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                aria-label="Next month"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <LuChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100 pb-2">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`text-center text-[11px] font-semibold uppercase tracking-wide ${
                  i === 0 || i === 6 ? 'text-slate-500' : 'text-slate-600'
                }`}
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-slate-100">
            {days.map((day) => {
              const key = ymd(day);
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isToday = isSameDay(day, today);
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              const holiday = holidays.get(key);
              const dayItems = byDay.get(key) ?? [];

              // Days off get a wash so a week's shape reads before any text does. Outside the
              // current month everything recedes — those cells are context, not content.
              const cellTone = !inMonth
                ? 'bg-slate-50/50'
                : holiday
                  ? 'bg-rose-50/50'
                  : weekend
                    ? 'bg-slate-50/60'
                    : 'bg-white';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDialog({ kind: 'new', defaultDate: key })}
                  aria-label={
                    holiday
                      ? `${day.toDateString()} — ${holiday}, ${dayItems.length} interviews`
                      : `${day.toDateString()} — ${dayItems.length} interviews`
                  }
                  className={`min-h-26 border-b border-r border-slate-100 p-1.5 text-left align-top transition hover:bg-brand-50/40 [&:nth-child(7n)]:border-r-0 ${cellTone}`}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                        isToday
                          ? 'bg-brand-500 text-white shadow-[0_2px_8px_-2px_rgba(51,88,240,0.7)]'
                          : !inMonth
                            ? 'text-slate-300'
                            : holiday
                              ? 'text-rose-600'
                              : 'text-slate-600'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {/* Full width on its own row, the way an all-day event behaves — sharing a
                        line with the date left barely 60px, which cut "Araw ng Kagitingan"
                        down to "Araw ng K…". Still truncates for the longest names, so the
                        full text stays on the title. */}
                    {holiday && (
                      <span
                        className="block truncate rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                        title={holiday}
                      >
                        {holiday}
                      </span>
                    )}
                    {dayItems.slice(0, 3).map((iv) => {
                      const tone = eventTone(iv);
                      return (
                        <span
                          key={iv.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({ kind: 'edit', interview: iv });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              setDialog({ kind: 'edit', interview: iv });
                            }
                          }}
                          className={`flex items-center gap-1 truncate rounded border-l-2 py-0.5 pl-1 pr-1.5 text-[11px] font-medium transition ${tone.cls}`}
                          title={`${fmtTime(iv.scheduledAt)} · ${iv.candidateName ?? 'Candidate'} · ${MODE_LABEL[iv.mode]}${
                            iv.status !== 'scheduled' ? ` · ${iv.status.replace('_', ' ')}` : ''
                          }`}
                        >
                          {/* The dot carries the format, the chip colour carries the state —
                              two things a recruiter scans for at once. */}
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                          <span className="truncate">
                            {fmtTime(iv.scheduledAt)} {iv.candidateName ?? 'Candidate'}
                          </span>
                        </span>
                      );
                    })}
                    {dayItems.length > 3 && (
                      <span className="block px-1.5 text-[11px] font-medium text-slate-600">
                        +{dayItems.length - 3} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend — the colours only help if they are decodable. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-600">
            {STATUS_LEGEND.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-4 rounded-sm ${s.swatch}`} />
                {s.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-rose-100 ring-1 ring-rose-200" />
              Holiday
            </span>
            <span className="ml-auto inline-flex items-center gap-2">
              {MODE_LEGEND.map((m) => (
                <span key={m.label} className="inline-flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                  {m.label}
                </span>
              ))}
            </span>
          </div>
        </Card>

        {/* Upcoming */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Upcoming interviews</h2>
          {loading ? (
            <CardListSkeleton rows={3} />
          ) : upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
              <LuCalendarClock className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-sm text-slate-600">No upcoming interviews.</p>
              <button
                type="button"
                onClick={() => setDialog({ kind: 'new' })}
                className="mt-2 text-sm font-medium text-brand-600 hover:underline"
              >
                Schedule one
              </button>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((iv) => {
                const ModeIcon = MODE_ICON[iv.mode] ?? LuMonitor;
                const d = new Date(iv.scheduledAt);
                return (
                  <li key={iv.id}>
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: 'edit', interview: iv })}
                      className="group flex w-full items-center gap-3 rounded-lg border border-slate-100 p-2.5 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
                    >
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-50 text-center">
                        <span className="text-[10px] font-semibold uppercase text-slate-600">
                          {d.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span className="text-sm font-bold leading-none text-slate-700">
                          {d.getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {iv.candidateName ?? 'Candidate'}
                        </p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                          <ModeIcon className="h-3 w-3" />
                          {fmtTime(iv.scheduledAt)}
                          {iv.jobTitle ? ` · ${iv.jobTitle}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
                        {relative(iv.scheduledAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
            You’ll get a reminder before each interview. Tip: schedule straight from a{' '}
            <Link to="/hr/candidates" className="font-medium text-brand-600 hover:underline">
              candidate’s page
            </Link>
            .
          </p>
        </Card>
      </div>

      {dialog?.kind === 'new' && (
        <ScheduleInterviewDialog
          defaultDate={dialog.defaultDate}
          onClose={() => setDialog(null)}
          onSaved={afterChange}
        />
      )}
      {dialog?.kind === 'edit' && (
        <ScheduleInterviewDialog
          existing={dialog.interview}
          onClose={() => setDialog(null)}
          onSaved={afterChange}
          onDeleted={afterChange}
        />
      )}
    </div>
  );
}

/** A dot per interview format, so the kind of call is readable without opening it. */
const MODE_DOT: Record<InterviewMode, string> = {
  video: 'bg-violet-500',
  onsite: 'bg-emerald-500',
  phone: 'bg-sky-500',
  ai_voice: 'bg-fuchsia-500',
};

const MODE_LABEL: Record<InterviewMode, string> = {
  video: 'Video call',
  onsite: 'On-site',
  phone: 'Phone',
  ai_voice: 'AI voice',
};

const MODE_LEGEND = (Object.keys(MODE_DOT) as InterviewMode[]).map((m) => ({
  label: MODE_LABEL[m],
  dot: MODE_DOT[m],
}));

const STATUS_LEGEND = [
  { label: 'Scheduled', swatch: 'bg-brand-100 ring-1 ring-brand-300' },
  { label: 'Needs an outcome', swatch: 'bg-amber-100 ring-1 ring-amber-400' },
  { label: 'Completed', swatch: 'bg-emerald-100 ring-1 ring-emerald-400' },
  { label: 'No-show', swatch: 'bg-rose-100 ring-1 ring-rose-400' },
  { label: 'Cancelled', swatch: 'bg-slate-100 ring-1 ring-slate-300' },
];

/**
 * Two signals on one chip: the fill says what state the interview is in, the left border
 * reinforces it, and the dot says what kind of call it is. Colouring purely by format would
 * lose the one thing that needs acting on — an interview whose time has passed with no outcome
 * recorded.
 */
function eventTone(iv: Interview): { cls: string; dot: string } {
  const dot = MODE_DOT[iv.mode] ?? 'bg-slate-400';
  if (iv.status === 'canceled')
    return { cls: 'border-slate-300 bg-slate-100 text-slate-500 line-through', dot: 'bg-slate-300' };
  if (iv.status === 'completed')
    return { cls: 'border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100', dot };
  if (iv.status === 'no_show')
    return { cls: 'border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100', dot };
  if (new Date(iv.scheduledAt).getTime() + iv.durationMinutes * 60000 < Date.now()) {
    return { cls: 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100', dot };
  }
  return { cls: 'border-brand-400 bg-brand-50 text-brand-800 hover:bg-brand-100', dot };
}
