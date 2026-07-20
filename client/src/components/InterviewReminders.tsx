import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuBell, LuX } from 'react-icons/lu';
import { fetchInterviews } from '../api/endpoints';

const POLL_MS = 60 * 1000;
const GRACE_MS = 5 * 60 * 1000; // keep showing up to 5 min after start
const STORE_KEY = 'interview_reminders_notified';

type Toast = { key: string; title: string; body: string };

function loadNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveNotified(set: Set<string>) {
  try {
    // Cap the stored history so it can't grow without bound.
    localStorage.setItem(STORE_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* ignore */
  }
}

/**
 * Polls upcoming interviews while the HR app is open and fires an in-app toast
 * (plus a browser notification, if permitted) once each interview enters its
 * reminder window. De-duplicated per interview+time via localStorage.
 */
export default function InterviewReminders() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notified = useRef<Set<string>>(loadNotified());

  useEffect(() => {
    // Ask once for browser-notification permission (best-effort).
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    let stopped = false;

    async function check() {
      let list;
      try {
        const res = await fetchInterviews({ status: 'scheduled' });
        list = res.interviews;
      } catch {
        return;
      }
      if (stopped) return;

      const now = Date.now();
      for (const iv of list) {
        const start = new Date(iv.scheduledAt).getTime();
        const windowStart = start - iv.reminderMinutes * 60000;
        const due = now >= windowStart && now <= start + GRACE_MS;
        const key = `${iv.id}@${iv.scheduledAt}`;
        if (!due || notified.current.has(key)) continue;

        notified.current.add(key);
        saveNotified(notified.current);

        const mins = Math.round((start - now) / 60000);
        const whenText =
          mins > 1 ? `in ${mins} minutes` : mins === 1 ? 'in 1 minute' : 'now';
        const title = `Interview ${whenText}`;
        const body = `${iv.candidateName ?? 'Candidate'}${iv.jobTitle ? ` · ${iv.jobTitle}` : ''} at ${new Date(
          iv.scheduledAt,
        ).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

        setToasts((t) => [...t, { key, title, body }]);

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(title, { body, tag: key });
          } catch {
            /* ignore */
          }
        }
      }
    }

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  function dismiss(key: string) {
    setToasts((t) => t.filter((x) => x.key !== key));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.key}
          className="animate-rise overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-start gap-3 p-3.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LuBell className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{t.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.body}</p>
              <Link
                to="/hr/scheduler"
                onClick={() => dismiss(t.key)}
                className="mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline"
              >
                View in scheduler →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.key)}
              aria-label="Dismiss"
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <LuX className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
