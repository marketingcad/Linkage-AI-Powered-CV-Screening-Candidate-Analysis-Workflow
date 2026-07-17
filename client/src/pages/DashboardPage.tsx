import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  LuArrowRight,
  LuBriefcase,
  LuChartColumn,
  LuFilter,
  LuGauge,
  LuStar,
  LuTarget,
  LuUsers,
} from 'react-icons/lu';
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
  const [all, setAll] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchStats(), fetchCandidates()])
      .then(([s, c]) => {
        setStats(s);
        setAll(c.candidates);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  // Recruitment analytics computed from the full candidate list.
  const analytics = useMemo(() => {
    const scored = all
      .map((c) => c.overallScore ?? c.qualificationScore)
      .filter((n): n is number => n != null);
    const buckets: [string, number, number][] = [
      ['0–19', 0, 19],
      ['20–39', 20, 39],
      ['40–59', 40, 59],
      ['60–79', 60, 79],
      ['80–100', 80, 100],
    ];
    const dist = buckets.map(([label, min, max]) => ({
      label,
      count: scored.filter((s) => s >= min && s <= max).length,
    }));

    const inStages = (st: CandidateStage[]) => all.filter((c) => st.includes(c.stage)).length;
    const funnel = [
      { label: 'Applied', value: all.length },
      { label: 'Shortlisted', value: inStages(['shortlisted', 'interviewing', 'hired']) },
      { label: 'Interviewing', value: inStages(['interviewing', 'hired']) },
      { label: 'Hired', value: inStages(['hired']) },
    ];

    const srcMap = new Map<string, { count: number; sum: number; n: number; hired: number }>();
    for (const c of all) {
      const e = srcMap.get(c.source) ?? { count: 0, sum: 0, n: 0, hired: 0 };
      e.count++;
      const s = c.overallScore ?? c.qualificationScore;
      if (s != null) {
        e.sum += s;
        e.n++;
      }
      if (c.stage === 'hired') e.hired++;
      srcMap.set(c.source, e);
    }
    const sources = [...srcMap.entries()]
      .map(([source, e]) => ({
        source,
        count: e.count,
        avg: e.n ? Math.round(e.sum / e.n) : null,
        hired: e.hired,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      dist,
      maxDist: Math.max(1, ...dist.map((d) => d.count)),
      totalScored: scored.length,
      funnel,
      sources,
    };
  }, [all]);

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

      {/* Analytics: funnel + score distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LuFilter className="h-4 w-4 text-brand-500" />
            Recruitment funnel
          </h2>
          {analytics.funnel[0]!.value === 0 ? (
            <EmptyHint text="No candidates yet." />
          ) : (
            <div className="space-y-3">
              {analytics.funnel.map((f, i) => {
                const base = analytics.funnel[0]!.value || 1;
                const pct = Math.round((f.value / base) * 100);
                return (
                  <div key={f.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{f.label}</span>
                      <span className="font-semibold text-slate-800">
                        {f.value}{' '}
                        <span className="text-xs font-normal text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${FUNNEL_COLORS[i] ?? 'bg-slate-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LuChartColumn className="h-4 w-4 text-brand-500" />
            Score distribution
          </h2>
          {analytics.totalScored === 0 ? (
            <EmptyHint text="No scored candidates yet." />
          ) : (
            <div className="flex h-40 items-end gap-2">
              {analytics.dist.map((d) => (
                <div
                  key={d.label}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="text-xs font-semibold text-slate-700">{d.count}</span>
                  <div
                    className="w-full rounded-t bg-brand-400"
                    style={{
                      height: `${Math.round((d.count / analytics.maxDist) * 78)}%`,
                      minHeight: d.count ? 4 : 0,
                    }}
                  />
                  <span className="text-[10px] text-slate-400">{d.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Source effectiveness */}
      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <LuTarget className="h-4 w-4 text-brand-500" />
          Source effectiveness
        </h2>
        {analytics.sources.length === 0 ? (
          <EmptyHint text="No applications yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Source</th>
                  <th className="pb-2 text-right">Applicants</th>
                  <th className="pb-2 text-right">Avg score</th>
                  <th className="pb-2 text-right">Hired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.sources.map((s) => (
                  <tr key={s.source}>
                    <td className="py-2.5">
                      <SourceBadge source={s.source} />
                    </td>
                    <td className="py-2.5 text-right font-medium text-slate-700">{s.count}</td>
                    <td className="py-2.5 text-right font-medium text-slate-700">{s.avg ?? '—'}</td>
                    <td className="py-2.5 text-right font-medium text-slate-700">{s.hired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
        <CandidateTable candidates={all.slice(0, 5)} showJob />
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

const FUNNEL_COLORS = ['bg-slate-400', 'bg-brand-500', 'bg-violet-500', 'bg-emerald-500'];

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
