import { useEffect, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import { LuColumns3, LuTable } from 'react-icons/lu';
import { fetchCandidates, updateCandidateStage } from '../api/endpoints';
import type { CandidateStage, CandidateSummary } from '../api/types';
import { Alert, Spinner } from '../components/ui';
import CandidateTable from '../components/CandidateTable';
import CandidateBoard from '../components/CandidateBoard';

const FILTERS: { value: '' | CandidateStage; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

type View = 'board' | 'table';

const VIEWS: { value: View; label: string; Icon: IconType }[] = [
  { value: 'board', label: 'Board', Icon: LuColumns3 },
  { value: 'table', label: 'Table', Icon: LuTable },
];

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [view, setView] = useState<View>('board');
  const [stage, setStage] = useState<'' | CandidateStage>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    fetchCandidates()
      .then((res) => setCandidates(res.candidates))
      .catch(() => setError('Failed to load candidates.'))
      .finally(() => setLoading(false));
  }, []);

  // Optimistically move a candidate to a new stage; revert on failure.
  async function handleMove(id: string, toStage: CandidateStage) {
    const prev = candidates;
    const target = prev.find((c) => c.id === id);
    if (!target || target.stage === toStage) return;
    setMoveError(null);
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, stage: toStage } : c)));
    try {
      await updateCandidateStage(id, toStage);
    } catch {
      setCandidates(prev); // revert
      setMoveError(`Couldn't move ${target.fullName}. Please try again.`);
    }
  }

  const filtered = useMemo(
    () => (stage ? candidates.filter((c) => c.stage === stage) : candidates),
    [candidates, stage],
  );

  return (
    <div className="animate-rise space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Candidates</h1>
          <p className="mt-1 text-sm text-slate-500">
            {view === 'board'
              ? 'Drag candidates between stages to move them through the pipeline.'
              : 'Ranked by AI qualification score across all roles.'}
          </p>
        </div>

        {/* View toggle */}
        <div
          role="tablist"
          aria-label="Candidate view"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        >
          {VIEWS.map(({ value, label, Icon }) => {
            const active = view === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(value)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-500 text-white shadow-[0_2px_8px_-2px_rgba(51,88,240,0.6)]'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {moveError && <Alert kind="error">{moveError}</Alert>}

      {loading ? (
        <Spinner label="Loading candidates…" />
      ) : view === 'board' ? (
        <CandidateBoard candidates={candidates} onMove={handleMove} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStage(f.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  stage === f.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <CandidateTable candidates={filtered} showJob />
        </div>
      )}
    </div>
  );
}
