import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuSparkles, LuUsers } from 'react-icons/lu';
import { scanTalentPool } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { TalentMatch } from '../api/types';
import { Alert, Spinner, StageBadge } from '../components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

function simTone(sim: number): string {
  if (sim >= 75) return 'bg-emerald-100 text-emerald-700';
  if (sim >= 50) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}

export default function TalentPoolDialog({
  jobId,
  jobTitle,
  onClose,
}: {
  jobId: string;
  jobTitle: string;
  onClose: () => void;
}) {
  const [matches, setMatches] = useState<TalentMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scanTalentPool(jobId, 10)
      .then((res) => setMatches(res.matches))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not scan the talent pool.'),
      );
  }, [jobId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 px-6 py-4 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <LuSparkles className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="font-display text-lg font-semibold text-slate-900">
                Talent-pool matches
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Past applicants to other roles, ranked by fit to <b>{jobTitle}</b>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <Alert kind="error">{error}</Alert>
          ) : matches === null ? (
            <Spinner label="Scanning the talent pool…" />
          ) : matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <LuUsers className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-600">No other applicants yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Once people apply to other roles, their best matches for this job show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {matches.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/hr/candidates/${m.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-bold ${simTone(m.similarity)}`}
                    >
                      {m.similarity}
                      <span className="text-[9px] font-medium opacity-70">match</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{m.fullName}</p>
                      <p className="truncate text-xs text-slate-400">
                        Applied to {m.jobTitle ?? 'another role'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {(m.overallScore ?? m.qualificationScore) != null && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {m.overallScore ?? m.qualificationScore}
                        </span>
                      )}
                      <StageBadge value={m.stage} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
