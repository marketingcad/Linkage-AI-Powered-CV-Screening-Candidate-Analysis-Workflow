import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCandidates, fetchStats } from '../api/endpoints';
import type { CandidateSummary, Stats } from '../api/types';
import { Alert, Card, formatSource, Skeleton, TableSkeleton } from '../components/ui';
import CandidateTable from '../components/CandidateTable';

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  interviewing: 'Interviewing',
  hired: 'Hired',
  rejected: 'Rejected',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchStats(), fetchCandidates()])
      .then(([s, c]) => {
        setStats(s);
        setTop(c.candidates.slice(0, 5));
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="animate-rise space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI-screened candidates across all your open roles.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total candidates" value={stats?.totalCandidates ?? 0} icon="👥" tint="brand" />
        <StatCard label="Open jobs" value={stats?.openJobs ?? 0} icon="💼" tint="violet" />
        <StatCard label="Avg. score" value={stats?.avgScore ?? 0} suffix="/100" icon="📊" tint="emerald" />
        <StatCard
          label="Shortlisted"
          value={stats?.byStage.find((s) => s.stage === 'shortlisted')?.value ?? 0}
          icon="⭐"
          tint="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {stats && stats.byStage.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Pipeline by stage</h2>
            <div className="flex flex-wrap gap-6">
              {stats.byStage.map((s) => (
                <div key={s.stage}>
                  <p className="text-2xl font-semibold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500">{STAGE_LABELS[s.stage] ?? s.stage}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {stats && stats.bySource.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Candidates by channel</h2>
            <div className="flex flex-wrap gap-6">
              {stats.bySource.map((s) => (
                <div key={s.source}>
                  <p className="text-2xl font-semibold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500">{formatSource(s.source)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Top candidates</h2>
          <Link to="/hr/candidates" className="text-sm font-medium text-brand-600 hover:underline">
            View all →
          </Link>
        </div>
        <CandidateTable candidates={top} showJob />
      </div>
    </div>
  );
}

const TINTS: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

function StatCard({
  label,
  value,
  suffix,
  icon,
  tint,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: string;
  tint: keyof typeof TINTS;
}) {
  return (
    <Card className="p-5 transition-shadow hover:shadow-(--shadow-raised)">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">
            {value}
            {suffix && <span className="text-base font-medium text-slate-400">{suffix}</span>}
          </p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${TINTS[tint]}`}>
          {icon}
        </span>
      </div>
    </Card>
  );
}
