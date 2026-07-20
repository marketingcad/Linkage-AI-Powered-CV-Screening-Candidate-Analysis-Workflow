import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuCalendarClock,
  LuCalendarPlus,
  LuChevronLeft,
  LuChevronRight,
  LuMapPin,
  LuMonitor,
  LuPhone,
  LuVideo,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { fetchInterviews } from '../api/endpoints';
import type { Interview, InterviewMode } from '../api/types';
import { Alert, Button, Card, Spinner } from '../components/ui';
import ScheduleInterviewDialog from '../components/ScheduleInterviewDialog';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODE_ICON: Record<InterviewMode, IconType> = {
  video: LuVideo,
  onsite: LuMapPin,
  phone: LuPhone,
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

  const days = calendarDays(viewMonth);
  const today = new Date();

  function afterChange() {
    setDialog(null);
    load();
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
            <p className="text-sm text-slate-500">
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
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
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
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <LuChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100 pb-2">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = ymd(day);
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isToday = isSameDay(day, today);
              const dayItems = byDay.get(key) ?? [];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDialog({ kind: 'new', defaultDate: key })}
                  className={`min-h-24 border-b border-r border-slate-100 p-1.5 text-left align-top transition hover:bg-slate-50/70 [&:nth-child(7n)]:border-r-0 ${
                    inMonth ? 'bg-white' : 'bg-slate-50/40'
                  }`}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday
                          ? 'bg-brand-500 text-white'
                          : inMonth
                            ? 'text-slate-600'
                            : 'text-slate-300'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((iv) => (
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
                        className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${pillCls(
                          iv,
                        )}`}
                        title={`${fmtTime(iv.scheduledAt)} · ${iv.candidateName ?? 'Candidate'}`}
                      >
                        {fmtTime(iv.scheduledAt)} {iv.candidateName ?? 'Candidate'}
                      </span>
                    ))}
                    {dayItems.length > 3 && (
                      <span className="block px-1.5 text-[11px] font-medium text-slate-400">
                        +{dayItems.length - 3} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Upcoming */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Upcoming interviews</h2>
          {loading ? (
            <Spinner label="Loading…" />
          ) : upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
              <LuCalendarClock className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-sm text-slate-400">No upcoming interviews.</p>
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
                        <span className="text-[10px] font-semibold uppercase text-slate-400">
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
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
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

          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
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

function pillCls(iv: Interview): string {
  if (iv.status === 'canceled') return 'bg-slate-100 text-slate-400 line-through';
  if (iv.status === 'completed') return 'bg-emerald-100 text-emerald-700';
  return 'bg-brand-100 text-brand-700 hover:bg-brand-200';
}
