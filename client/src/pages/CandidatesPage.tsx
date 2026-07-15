import { useEffect, useState } from 'react';
import { fetchCandidates } from '../api/endpoints';
import type { CandidateStage, CandidateSummary } from '../api/types';
import { Alert, Spinner } from '../components/ui';
import CandidateTable from '../components/CandidateTable';

const FILTERS: { value: '' | CandidateStage; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [stage, setStage] = useState<'' | CandidateStage>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchCandidates(stage ? { stage } : {})
      .then((res) => setCandidates(res.candidates))
      .catch(() => setError('Failed to load candidates.'))
      .finally(() => setLoading(false));
  }, [stage]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
        <p className="mt-1 text-sm text-slate-500">Ranked by AI qualification score across all roles.</p>
      </div>

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

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? <Spinner label="Loading candidates…" /> : <CandidateTable candidates={candidates} showJob />}
    </div>
  );
}
