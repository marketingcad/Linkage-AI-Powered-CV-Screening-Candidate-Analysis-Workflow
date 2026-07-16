import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IconType } from 'react-icons';
import { LuArrowRight, LuBriefcase, LuGauge, LuStar, LuUsers } from 'react-icons/lu';
import { fetchCandidates, fetchStats } from '../api/endpoints';
import type { CandidateStage, CandidateSummary, Stats } from '../api/types';
import { Alert, Card, Skeleton, SourceBadge, STAGE_ICONS, TableSkeleton } from '../components/ui';
import CandidateTable from '../components/CandidateTable';

// Fixed order + colors for the pipeline visualization.
const STAGE_ORDER: { stage: CandidateStage; label: string; bar: string; text: string }[] = [
  { stage: 'new', label: 'New', bar: 'bg-slate-300', text: 'text-slate-500' },
  { stage: 'shortlisted', label: 'Shortlisted', bar: 'bg-brand-500', text: 'text-brand-600' },
  { stage: 'interviewing', label: 'Interviewing', bar: 'bg-violet-500', text: 'text-violet-600' },
  { stage: 'hired', label: 'Hired', bar: 'bg-emerald-500', text: 'text-emerald-600' },
  { stage: 'rejected', label: 'Rejected', bar: 'bg-rose-400', text: 'text-rose-500' },
];

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
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <TableSkeleton rows={5} />
      </div>
    );
  }

  const stageMap = new Map((stats?.byStage ?? []).map((s) => [s.stage, s.value]));
  const shortlisted = stageMap.get('shortlisted') ?? 0;
  const totalStaged = STAGE_ORDER.reduce((sum, s) => sum + (stageMap.get(s.stage) ?? 0), 0);
  const maxSource = Math.max(1, ...(stats?.bySource ?? []).map((s) => s.value));

  return (
    <div className="animate-rise space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI-screened candidates across all your open roles.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total candidates"
          value={stats?.totalCandidates ?? 0}
          caption="in your pipeline"
          Icon={LuUsers}
          tint="brand"
          to="/hr/candidates"
        />
        <StatCard
          label="Open jobs"
          value={stats?.openJobs ?? 0}
          caption="accepting applications"
          Icon={LuBriefcase}
          tint="violet"
          to="/hr/jobs"
        />
        <StatCard
          label="Avg. score"
          value={stats?.avgScore ?? 0}
          suffix="/100"
          caption="AI qualification"
          Icon={LuGauge}
          tint="emerald"
        />
        <StatCard
          label="Shortlisted"
          value={shortlisted}
          caption="ready to review"
          Icon={LuStar}
          tint="amber"
          to="/hr/candidates"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pipeline by stage */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Pipeline by stage</h2>
            <span className="text-xs text-slate-400">{totalStaged} total</span>
          </div>

          {totalStaged === 0 ? (
            <EmptyHint text="No candidates in the pipeline yet." />
          ) : (
            <>
              {/* Stacked bar */}
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                {STAGE_ORDER.map((s) => {
                  const v = stageMap.get(s.stage) ?? 0;
                  if (!v) return null;
                  return (
                    <div
                      key={s.stage}
                      className={s.bar}
                      style={{ width: `${(v / totalStaged) * 100}%` }}
                      title={`${s.label}: ${v}`}
                    />
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
                {STAGE_ORDER.map((s) => {
                  const v = stageMap.get(s.stage) ?? 0;
                  const Icon = STAGE_ICONS[s.stage];
                  return (
                    <div key={s.stage} className="flex items-center gap-2.5">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 ${s.text}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm text-slate-600">{s.label}</span>
                      <span className="text-sm font-semibold text-slate-800">{v}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Candidates by channel */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Candidates by channel</h2>
          {!stats || stats.bySource.length === 0 ? (
            <EmptyHint text="No applications yet." />
          ) : (
            <div className="space-y-3.5">
              {stats.bySource.map((s) => (
                <div key={s.source} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <SourceBadge source={s.source} />
                    <span className="text-sm font-semibold text-slate-800">{s.value}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-400"
                      style={{ width: `${(s.value / maxSource) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Top candidates</h2>
          <Link
            to="/hr/candidates"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
          >
            View all <LuArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <CandidateTable candidates={top} showJob />
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
      {text}
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
  caption,
  Icon,
  tint,
  to,
}: {
  label: string;
  value: number;
  suffix?: string;
  caption: string;
  Icon: IconType;
  tint: keyof typeof TINTS;
  to?: string;
}) {
  const body = (
    <Card className="h-full p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-(--shadow-raised)">
      <div className="flex items-start justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${TINTS[tint]}`}>
          <Icon className="h-5 w-5" />
        </span>
        {to && (
          <LuArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
        )}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
        {value}
        {suffix && <span className="text-base font-medium text-slate-400">{suffix}</span>}
      </p>
      <p className="mt-0.5 text-sm font-medium text-slate-600">{label}</p>
      <p className="text-xs text-slate-400">{caption}</p>
    </Card>
  );

  return to ? (
    <Link to={to} className="group block">
      {body}
    </Link>
  ) : (
    <div className="group">{body}</div>
  );
}
