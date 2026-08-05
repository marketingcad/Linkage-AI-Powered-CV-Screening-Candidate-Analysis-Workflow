import { useEffect, useState } from 'react';
import { LuBriefcase, LuClock, LuHandshake, LuHourglass, LuTrendingDown } from 'react-icons/lu';
import { fetchPipelineStats } from '../api/endpoints';
import { DISPOSITION_LABELS, DISPOSITION_ORDER } from '../api/types';
import type { DispositionCategory, PipelineStats } from '../api/types';
import { Card, Skeleton, STAGE_ICONS } from './ui';
import type { CandidateStage } from '../api/types';

/** The forward path only. Rejections are an exit from any of these, not a step after them. */
const FUNNEL: { stage: CandidateStage; label: string }[] = [
  { stage: 'new', label: 'Applied' },
  { stage: 'shortlisted', label: 'Shortlisted' },
  { stage: 'interviewing', label: 'Interviewed' },
  { stage: 'offer', label: 'Offered' },
  { stage: 'hired', label: 'Hired' },
];

function days(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1) return '<1d';
  return `${Math.round(n)}d`;
}

/**
 * Pipeline health: how fast people move, where they fall out, and whether offers land.
 *
 * Everything here comes from the stage-event log, so it is only as deep as the history —
 * a pipeline with no completed hires yet honestly reports "—" rather than a zero.
 */
export default function PipelineHealth() {
  const [data, setData] = useState<PipelineStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchPipelineStats()
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  // Non-critical panel — a metrics failure should not put an error banner on the overview.
  if (failed) return null;
  // Sized to the loaded card, not to a round number: an h-64 placeholder made the page jump
  // ~300px when the metrics arrived and shoved everything below it down.
  if (!data) return <Skeleton className="h-136 rounded-2xl" />;

  const reached = new Map(data.funnel.map((f) => [f.stage, f.candidates]));
  const advanced = new Map((data.steps ?? []).map((s) => [`${s.from_stage}>${s.to_stage}`, s.n]));
  const dwell = new Map(data.timeInStage.map((t) => [t.stage, t.median_days]));
  const applied = reached.get('new') ?? 0;
  const widest = Math.max(1, ...FUNNEL.map((f) => reached.get(f.stage) ?? 0));

  const byCategory = DISPOSITION_ORDER.map((cat) => ({
    cat,
    total: data.exitReasons
      .filter((r) => r.category === cat)
      .reduce((sum, r) => sum + r.n, 0),
    reasons: data.exitReasons.filter((r) => r.category === cat).sort((a, b) => b.n - a.n),
  })).filter((g) => g.total > 0);
  const uncategorized = data.exitReasons
    .filter((r) => r.category === null)
    .reduce((sum, r) => sum + r.n, 0);
  const exits = byCategory.reduce((s, g) => s + g.total, 0) + uncategorized;

  return (
    // No staggered animation delay here: the other cards mount with the page, but this one
    // mounts when its fetch resolves, so a delay would just hold it invisible after it appears.
    <Card className="animate-rise p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Pipeline health</h2>
        <span className="text-xs text-slate-600">from stage history</span>
      </div>

      {applied === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-600">
          No stage history yet. Metrics appear as candidates move through the pipeline.
        </p>
      ) : (
        <div className="space-y-6">
          {/* Headline numbers — five of them, so they wrap 2/3 on narrow screens rather than
              leaving a lone tile stranded on its own row. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi
              Icon={LuClock}
              label="Median time to hire"
              value={days(data.timeToHire.medianDays)}
              caption={
                data.timeToHire.hires === 0
                  ? 'no hires yet'
                  : `across ${data.timeToHire.hires} hire${data.timeToHire.hires === 1 ? '' : 's'}`
              }
            />
            <Kpi
              Icon={LuHandshake}
              label="Offer acceptance"
              value={data.offers.acceptanceRate == null ? '—' : `${data.offers.acceptanceRate}%`}
              caption={
                data.offers.acceptanceRate == null
                  ? 'no offers answered yet'
                  : `${data.offers.accepted} of ${data.offers.accepted + data.offers.declined} answered`
              }
            />
            <Kpi
              Icon={LuTrendingDown}
              label="Applied → hired"
              value={applied === 0 ? '—' : `${Math.round(((reached.get('hired') ?? 0) / applied) * 100)}%`}
              caption={`${reached.get('hired') ?? 0} of ${applied} applicants`}
            />
            {/* Time to fill measures the role, not the candidate: it starts when the
                requisition was approved, so it counts the weeks a job sat open before anyone
                applied — which time-to-hire above cannot see. */}
            <Kpi
              Icon={LuBriefcase}
              label="Median time to fill"
              value={days(data.timeToFill?.medianDays)}
              caption={
                !data.timeToFill?.filled
                  ? 'no roles filled yet'
                  : `across ${data.timeToFill.filled} role${data.timeToFill.filled === 1 ? '' : 's'}`
              }
            />
            <Kpi
              Icon={LuHourglass}
              label="Open requisitions"
              value={data.openRequisitions?.open ? String(data.openRequisitions.open) : '—'}
              caption={
                !data.openRequisitions?.open
                  ? 'none open and unfilled'
                  : `open ${days(data.openRequisitions.medianAgeDays)} median · oldest ${days(
                      data.openRequisitions.oldestDays,
                    )}`
              }
            />
          </div>

          {/* Funnel — reach, step conversion, and how long each step takes */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Funnel</h3>
              <span className="text-xs text-slate-600">ever reached · median time in stage</span>
            </div>
            <div className="space-y-2">
              {FUNNEL.map((f, i) => {
                const n = reached.get(f.stage) ?? 0;
                const prevStage = i === 0 ? null : FUNNEL[i - 1]!.stage;
                const prev = prevStage == null ? null : (reached.get(prevStage) ?? 0);
                // Conversion from the previous step, not from the top — that is the number that
                // tells you which handoff is leaking. The numerator is the people who reached
                // both stages, so candidates who skipped a stage cannot push it over 100%.
                const both = prevStage == null ? 0 : (advanced.get(`${prevStage}>${f.stage}`) ?? 0);
                const conv = prev == null || prev === 0 ? null : Math.round((both / prev) * 100);
                const Icon = STAGE_ICONS[f.stage];
                return (
                  <div key={f.stage} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="w-24 shrink-0 text-sm text-slate-700">{f.label}</span>
                    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                        style={{ width: `${(n / widest) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                      {n}
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-600">
                      {conv == null ? '' : `${conv}%`}
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-600">
                      {days(dwell.get(f.stage))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Why we lose people, split by who ended it */}
          {exits > 0 && (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Why candidates exited
                </h3>
                <span className="text-xs text-slate-600">{exits} total</span>
              </div>
              <div className="space-y-3">
                {byCategory.map((g) => (
                  <div key={g.cat}>
                    <div className="flex items-baseline justify-between">
                      <span className={`text-xs font-semibold ${CATEGORY_TEXT[g.cat]}`}>
                        {DISPOSITION_LABELS[g.cat]}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-slate-700">
                        {Math.round((g.total / exits) * 100)}% · {g.total}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {g.reasons.map((r) => (
                        <li
                          key={r.reason ?? 'none'}
                          className="flex items-center justify-between gap-3 text-xs text-slate-600"
                        >
                          <span className="min-w-0 truncate">{r.reason}</span>
                          <span className="shrink-0 tabular-nums">{r.n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {uncategorized > 0 && (
                  <p className="text-xs text-slate-600">
                    {uncategorized} exit{uncategorized === 1 ? '' : 's'} recorded without a reason —
                    pick one when rejecting to see them here.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const CATEGORY_TEXT: Record<DispositionCategory, string> = {
  employer_rejected: 'text-rose-600',
  candidate_withdrew: 'text-amber-700',
  role_cancelled: 'text-slate-600',
};

function Kpi({
  Icon,
  label,
  value,
  caption,
}: {
  Icon: typeof LuClock;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-center gap-1.5 text-slate-600">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{value}</p>
      <p className="mt-0.5 text-xs text-slate-600">{caption}</p>
    </div>
  );
}
