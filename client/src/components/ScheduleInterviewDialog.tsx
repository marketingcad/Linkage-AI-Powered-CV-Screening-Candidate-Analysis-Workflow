import { useEffect, useMemo, useState } from 'react';
import { LuCalendarClock, LuSearch, LuTrash2, LuTriangleAlert, LuUser } from 'react-icons/lu';
import {
  createInterview,
  deleteInterview,
  fetchAiInterviewLink,
  fetchCandidates,
  fetchInterviews,
  updateInterview,
  type EmailResult,
  type InterviewInput,
} from '../api/endpoints';
import type { CandidateSummary, Interview, InterviewMode, InterviewStatus } from '../api/types';
import { Alert, Button, ScoreRing, Spinner } from './ui';
import ConfirmDialog from './ConfirmDialog';
import FieldError from './FieldError';
import { useFormErrors } from '../lib/useFormErrors';
import * as v from '../lib/validators';
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

/**
 * A link typed into the location field is emailed to the candidate, so it has to be a real
 * http(s) URL. Video calls are always links; on-site/phone may be a plain address, unless
 * the recruiter clearly meant a URL (started typing a scheme or "www.").
 */
function isLinkValue(mode: InterviewMode, value: string) {
  return mode === 'video' || /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^www\./i.test(value);
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const f = useFormErrors<'candidate' | 'date' | 'time' | 'location' | 'notes'>('interview');

  // An interview that already happened legitimately sits in the past (you reopen it to mark
  // it completed), so only reject past times when the slot is actually being (re)scheduled.
  const originalWhen = existing ? toLocalParts(existing.scheduledAt) : null;
  const whenChanged =
    !originalWhen || date !== originalWhen.date || time !== originalWhen.time;
  const minDate = useMemo(() => {
    const today = toLocalParts().date;
    if (originalWhen && originalWhen.date < today) return originalWhen.date;
    return today;
  }, [originalWhen?.date]);

  // Existing scheduled interviews, to warn about double-booking (non-blocking).
  const [allInterviews, setAllInterviews] = useState<Interview[]>([]);
  useEffect(() => {
    fetchInterviews({ status: 'scheduled' })
      .then((r) => setAllInterviews(r.interviews))
      .catch(() => {
        /* conflict check is best-effort */
      });
  }, []);

  const conflicts = useMemo(() => {
    if (!date || !time) return [];
    const start = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(start)) return [];
    const end = start + duration * 60000;
    return allInterviews.filter((iv) => {
      if (existing && iv.id === existing.id) return false; // don't clash with itself
      const s = new Date(iv.scheduledAt).getTime();
      return s < end && s + iv.durationMinutes * 60000 > start; // time windows overlap
    });
  }, [allInterviews, date, time, duration, existing]);

  const locationLabel = mode === 'onsite' ? 'Location' : 'Meeting link';

  function locationError() {
    const val = location.trim();
    if (!val) return undefined; // optional in every mode
    return (
      v.maxLen(val, v.LIMITS.interviewLocation, locationLabel) ??
      (isLinkValue(mode, val) ? v.httpUrl(val, 'Meeting link') : undefined)
    );
  }

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    f.reset();
    try {
      await deleteInterview(existing.id);
      onDeleted?.(existing.id);
    } catch (err) {
      f.setServerError(err, 'Failed to delete the interview.');
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const ok = f.validate({
      candidate: selected ? undefined : 'Choose a candidate to schedule.',
      date:
        v.required(date, 'Date') ??
        (time
          ? v.dateTime(`${date}T${time}`, {
              label: 'Interview date and time',
              allowPast: !whenChanged,
            })
          : undefined),
      time: v.required(time, 'Time'),
      location: locationError(),
      notes: v.maxLen(notes, v.LIMITS.notes, 'Notes'),
    });
    if (!ok || !selected) return;

    const scheduledAt = new Date(`${date}T${time}`);

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
      f.setServerError(err, 'Failed to save the interview.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
              <DialogDescription className="text-xs text-slate-600">
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
                  <LuUser className="h-4 w-4 text-slate-600" />
                  {selected?.fullName}
                </div>
              ) : (
                <CandidatePicker
                  selected={selected}
                  onSelect={(c) => {
                    setSelected(c);
                    f.clearError('candidate');
                  }}
                />
              )}
              <FieldError id={f.errorId('candidate')} message={f.errors.candidate} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" required error={f.errors.date} errorId={f.errorId('date')}>
                <input
                  type="date"
                  required
                  min={minDate}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    f.clearError('date');
                  }}
                  className={inputCls}
                  {...f.fieldProps('date')}
                />
              </Field>
              <Field label="Time" required error={f.errors.time} errorId={f.errorId('time')}>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value);
                    f.clearError('time');
                    f.clearError('date'); // the past-time error is about date+time together
                  }}
                  className={inputCls}
                  {...f.fieldProps('time')}
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
                          f.clearError('date');
                          f.clearError('time');
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
                  <option value="ai_voice">AI voice interview</option>
                </select>
              </Field>
            </div>

            {mode === 'ai_voice' ? (
              <AiVoicePanel interviewId={existing?.id ?? null} />
            ) : (
              <Field
                label={mode === 'onsite' ? 'Location / address' : 'Meeting link / details'}
                error={f.errors.location}
                errorId={f.errorId('location')}
              >
                <input
                  // A video call's "location" is a link that goes out in the invite email, so let
                  // the browser check it too; on-site/phone stay free text for an address.
                  type={mode === 'video' ? 'url' : 'text'}
                  inputMode={mode === 'video' ? 'url' : undefined}
                  maxLength={v.LIMITS.interviewLocation}
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    f.clearError('location');
                  }}
                  className={inputCls}
                  placeholder={mode === 'onsite' ? 'Office address, room…' : 'https://meet…'}
                  {...f.fieldProps('location')}
                />
              </Field>
            )}

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
                  <option value="no_show">No-show</option>
                  <option value="canceled">Canceled</option>
                </select>
              </Field>
            )}

            <Field
              label="Notes (optional, internal)"
              error={f.errors.notes}
              errorId={f.errorId('notes')}
            >
              <textarea
                value={notes}
                maxLength={v.LIMITS.notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  f.clearError('notes');
                }}
                rows={3}
                className={inputCls}
                placeholder="Panel, focus areas, prep… (not shared with the candidate)"
                {...f.fieldProps('notes')}
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
                <span className="block text-xs font-normal text-slate-600">
                  {existing
                    ? 'Send an updated invite if you reschedule, or a notice if you cancel — with the meeting link and a calendar file.'
                    : 'Sends an invitation with the date, time, meeting link, and a calendar (.ics) attachment.'}
                </span>
              </span>
            </label>

            {conflicts.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <LuTriangleAlert className="h-4 w-4" />
                  Possible scheduling conflict
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-amber-700 dark:text-amber-200/90">
                  {conflicts.map((iv) => (
                    <li key={iv.id}>
                      Overlaps with <b>{iv.candidateName ?? 'another interview'}</b> at{' '}
                      {new Date(iv.scheduledAt).toLocaleString('en-US', {
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {selected && iv.candidateId === selected.id
                        ? ' — this candidate is already booked then'
                        : ''}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300/70">
                  You can still schedule if this is intentional.
                </p>
              </div>
            )}

            {f.formError && <Alert kind="error">{f.formError}</Alert>}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            {existing ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
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

    {/* Sibling of the scheduling dialog, not a child of it — a Radix Dialog nested inside
        another Dialog's root fights it for the focus trap. */}
    <ConfirmDialog
      open={confirmingDelete}
      title="Remove this interview?"
      body="It will be taken off the calendar and its reminder cancelled. The candidate is not notified automatically."
      confirmLabel="Remove interview"
      busy={deleting}
      onConfirm={() => {
        setConfirmingDelete(false);
        void handleDelete();
      }}
      onCancel={() => setConfirmingDelete(false)}
    />
    </>
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
          <LuUser className="h-4 w-4 text-slate-600" />
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
        <LuSearch className="h-4 w-4 text-slate-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search candidates by name, email, or role…"
          className="w-full text-sm text-slate-800 outline-none placeholder:text-slate-600"
        />
      </div>
      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {all === null ? (
            <div className="p-3">
              <Spinner label="Loading…" />
            </div>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-slate-600">No candidates found.</p>
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
                  <span className="block truncate text-xs text-slate-600">
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
          <span aria-hidden="true" className="ml-0.5 text-rose-500 dark:text-rose-400">
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

/**
 * Shown when mode = "AI voice". For an existing interview it fetches the candidate join link;
 * for a not-yet-saved one it explains the link is generated + emailed on save.
 */
function AiVoicePanel({ interviewId }: { interviewId: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!interviewId) return;
    let active = true;
    fetchAiInterviewLink(interviewId)
      .then((r) => active && setLink(r.link))
      .catch((e) =>
        active &&
        setError(
          e?.message?.includes('not_configured')
            ? 'AI interviews are not configured on the server (set LIVEKIT_* env vars).'
            : 'Could not generate the join link.',
        ),
      );
    return () => {
      active = false;
    };
  }, [interviewId]);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm dark:border-violet-900/50 dark:bg-violet-950/20">
      <p className="font-medium text-violet-800 dark:text-violet-300">AI voice interview</p>
      <p className="mt-0.5 text-xs text-violet-700/80 dark:text-violet-300/70">
        An AI interviewer runs the call and records it. The candidate is emailed a private link
        that only opens around the scheduled time.
      </p>

      {!interviewId && (
        <p className="mt-2 text-xs text-slate-600">
          Save the interview to generate the candidate’s join link (it’s included in their invite
          email automatically).
        </p>
      )}

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {link && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input readOnly value={link} className={inputCls} onFocus={(e) => e.target.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
