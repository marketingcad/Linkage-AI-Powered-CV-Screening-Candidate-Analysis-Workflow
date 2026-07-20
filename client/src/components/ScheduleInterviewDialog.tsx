import { useEffect, useMemo, useState } from 'react';
import { LuCalendarClock, LuSearch, LuTrash2, LuUser } from 'react-icons/lu';
import {
  createInterview,
  deleteInterview,
  fetchCandidates,
  updateInterview,
  type EmailResult,
  type InterviewInput,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import type { CandidateSummary, Interview, InterviewMode, InterviewStatus } from '../api/types';
import { Alert, Button, ScoreRing, Spinner } from './ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const REMINDER_OPTIONS = [
  { value: 0, label: 'At start time' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

/** Split an ISO timestamp into local date (YYYY-MM-DD) + time (HH:mm) input values. */
function toLocalParts(iso?: string): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function ScheduleInterviewDialog({
  candidate,
  existing,
  defaultDate,
  suggestedSlots,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** Preset candidate (when scheduling from a candidate page). */
  candidate?: { id: string; fullName: string };
  /** Existing interview to edit. */
  existing?: Interview;
  /** Pre-selected calendar day (YYYY-MM-DD) when creating from the calendar. */
  defaultDate?: string;
  /** Candidate-proposed interview slots (ISO) offered as one-tap quick-picks. */
  suggestedSlots?: string[];
  onClose: () => void;
  onSaved: (interview: Interview, email?: EmailResult) => void;
  onDeleted?: (id: string) => void;
}) {
  const presetCandidate =
    candidate ??
    (existing
      ? { id: existing.candidateId, fullName: existing.candidateName ?? 'Candidate' }
      : undefined);

  const initial = toLocalParts(existing?.scheduledAt);
  const [selected, setSelected] = useState<{ id: string; fullName: string } | null>(
    presetCandidate ?? null,
  );
  const [date, setDate] = useState(defaultDate ?? initial.date);
  const [time, setTime] = useState(existing ? initial.time : '09:00');
  const [duration, setDuration] = useState(existing?.durationMinutes ?? 45);
  const [mode, setMode] = useState<InterviewMode>(existing?.mode ?? 'video');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [reminder, setReminder] = useState(existing?.reminderMinutes ?? 30);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [status, setStatus] = useState<InterviewStatus>(existing?.status ?? 'scheduled');
  const [notifyCandidate, setNotifyCandidate] = useState(true);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!existing) return;
    if (!confirm('Remove this interview from the calendar?')) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteInterview(existing.id);
      onDeleted?.(existing.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete the interview.');
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError('Choose a candidate to schedule.');
      return;
    }
    if (!date || !time) {
      setError('Pick a date and time.');
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError('Invalid date/time.');
      return;
    }

    const payload: InterviewInput = {
      candidateId: selected.id,
      scheduledAt: scheduledAt.toISOString(),
      durationMinutes: duration,
      mode,
      location: location.trim() || null,
      reminderMinutes: reminder,
      notes: notes.trim() || null,
      notifyCandidate,
    };

    setSaving(true);
    try {
      const res = existing
        ? await updateInterview(existing.id, { ...payload, status })
        : await createInterview(payload);
      onSaved(res.interview, res.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the interview.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 px-6 py-4 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LuCalendarClock className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="font-display text-lg font-semibold text-slate-900">
                {existing ? 'Edit interview' : 'Schedule interview'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Pin a candidate to the calendar and get a reminder before it starts.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {/* Candidate */}
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Candidate</span>
              {presetCandidate ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <LuUser className="h-4 w-4 text-slate-400" />
                  {selected?.fullName}
                </div>
              ) : (
                <CandidatePicker selected={selected} onSelect={setSelected} />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Time">
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            {suggestedSlots && suggestedSlots.length > 0 && (
              <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                <p className="mb-1.5 text-xs font-medium text-slate-600">
                  Candidate suggested these times — tap to use one:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedSlots.map((iso, i) => {
                    const p = toLocalParts(iso);
                    const active = date === p.date && time === p.time;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setDate(p.date);
                          setTime(p.time);
                        }}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                          active
                            ? 'bg-brand-500 text-white'
                            : 'bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100'
                        }`}
                      >
                        {new Date(iso).toLocaleString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration">
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={inputCls}
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} minutes
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mode">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as InterviewMode)}
                  className={inputCls}
                >
                  <option value="video">Video call</option>
                  <option value="onsite">On-site</option>
                  <option value="phone">Phone</option>
                </select>
              </Field>
            </div>

            <Field label={mode === 'onsite' ? 'Location / address' : 'Meeting link / details'}>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={inputCls}
                placeholder={mode === 'onsite' ? 'Office address, room…' : 'https://meet…'}
              />
            </Field>

            <Field label="Reminder">
              <select
                value={reminder}
                onChange={(e) => setReminder(Number(e.target.value))}
                className={inputCls}
              >
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            {existing && (
              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as InterviewStatus)}
                  className={inputCls}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </Field>
            )}

            <Field label="Notes (optional, internal)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputCls}
                placeholder="Panel, focus areas, prep… (not shared with the candidate)"
              />
            </Field>

            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <input
                type="checkbox"
                checked={notifyCandidate}
                onChange={(e) => setNotifyCandidate(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-500 accent-brand-500"
              />
              <span className="text-sm text-slate-700">
                Email the candidate
                <span className="block text-xs font-normal text-slate-500">
                  {existing
                    ? 'Send an updated invite if you reschedule, or a notice if you cancel — with the meeting link and a calendar file.'
                    : 'Sends an invitation with the date, time, meeting link, and a calendar (.ics) attachment.'}
                </span>
              </span>
            </label>

            {error && <Alert kind="error">{error}</Alert>}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            {existing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                <LuTrash2 className="h-4 w-4" />
                {deleting ? 'Removing…' : 'Delete'}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || deleting}>
                {saving ? <Spinner /> : existing ? 'Save changes' : 'Schedule interview'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Searchable candidate picker used when no candidate is preset. */
function CandidatePicker({
  selected,
  onSelect,
}: {
  selected: { id: string; fullName: string } | null;
  onSelect: (c: { id: string; fullName: string } | null) => void;
}) {
  const [all, setAll] = useState<CandidateSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchCandidates()
      .then((res) => setAll(res.candidates))
      .catch(() => setAll([]));
  }, []);

  const results = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? all.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            (c.jobTitle ?? '').toLowerCase().includes(q),
        )
      : all;
    return list.slice(0, 30);
  }, [all, query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-slate-700">
          <LuUser className="h-4 w-4 text-slate-400" />
          {selected.fullName}
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setOpen(true);
          }}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-brand-500">
        <LuSearch className="h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search candidates by name, email, or role…"
          className="w-full text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      </div>
      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {all === null ? (
            <div className="p-3">
              <Spinner label="Loading…" />
            </div>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">No candidates found.</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect({ id: c.id, fullName: c.fullName });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
              >
                <ScoreRing score={c.overallScore ?? c.qualificationScore} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700">{c.fullName}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {c.jobTitle ?? c.email}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
