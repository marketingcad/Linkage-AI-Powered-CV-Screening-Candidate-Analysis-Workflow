import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuBell } from 'react-icons/lu';
import { fetchCandidates } from '../api/endpoints';
import type { CandidateSummary } from '../api/types';
import { ScoreRing, SourceBadge } from './ui';

const POLL_MS = 60 * 1000;
const STORE_KEY = 'notif_read_candidates';

function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveRead(set: Set<string>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...set].slice(-500)));
  } catch {
    /* ignore */
  }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Header notification bell: shows newly-applied candidates in a scrollable dropdown.
 * Each unread candidate carries a solid dot; clicking a candidate marks it read
 * (removes the dot) and opens their profile. Read state persists in localStorage.
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CandidateSummary[]>([]);
  const [read, setRead] = useState<Set<string>>(loadRead);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    fetchCandidates({ stage: 'new' })
      .then((res) => setItems(res.candidates))
      .catch(() => {
        /* non-critical */
      });
  }

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unreadCount = useMemo(
    () => items.filter((c) => !read.has(c.id)).length,
    [items, read],
  );

  function markRead(id: string) {
    setRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveRead(next);
      return next;
    });
  }

  function openCandidate(id: string) {
    markRead(id);
    setOpen(false);
    navigate(`/hr/candidates/${id}`);
  }

  function markAllRead() {
    setRead((prev) => {
      const next = new Set(prev);
      items.forEach((c) => next.add(c.id));
      saveRead(next);
      return next;
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} new)` : ''}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 data-[open=true]:bg-slate-100"
        data-open={open}
      >
        <LuBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">New candidates</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <LuBell className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">No new candidates.</p>
              </div>
            ) : (
              items.map((c) => {
                const isUnread = !read.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openCandidate(c.id)}
                    className={`flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-left transition last:border-0 hover:bg-slate-50 ${
                      isUnread ? 'bg-brand-50/40' : ''
                    }`}
                  >
                    <ScoreRing score={c.overallScore ?? c.qualificationScore} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{c.fullName}</p>
                      <p className="truncate text-xs text-slate-400">
                        {c.jobTitle ?? 'Candidate'} · {timeAgo(c.createdAt)}
                      </p>
                      <div className="mt-1">
                        <SourceBadge source={c.source} />
                      </div>
                    </div>
                    {/* Solid unread dot — removed once this candidate is clicked. */}
                    {isUnread && (
                      <span className="mt-0.5 h-2.5 w-2.5 shrink-0 self-start rounded-full bg-brand-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/hr/candidates');
            }}
            className="block w-full border-t border-slate-100 py-2.5 text-center text-xs font-medium text-brand-600 transition hover:bg-slate-50"
          >
            View all candidates
          </button>
        </div>
      )}
    </div>
  );
}
