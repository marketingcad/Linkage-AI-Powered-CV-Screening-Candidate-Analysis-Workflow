import type { ReactNode } from 'react';
import type { AnalysisStatus, CandidateStage, Recommendation } from '../api/types';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-500">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

export function scoreBg(score: number | null | undefined): string {
  if (score == null) return 'bg-slate-100 text-slate-500';
  if (score >= 80) return 'bg-emerald-100 text-emerald-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

export function ScoreRing({ score, size = 56 }: { score: number | null; size?: number }) {
  const value = score ?? 0;
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  const stroke = score == null ? '#cbd5e1' : value >= 80 ? '#059669' : value >= 60 ? '#d97706' : '#e11d48';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute text-sm font-bold ${scoreColor(score)}`}>
        {score == null ? '—' : score}
      </span>
    </div>
  );
}

const RECOMMENDATION_META: Record<Recommendation, { label: string; cls: string }> = {
  strong_match: { label: 'Strong match', cls: 'bg-emerald-100 text-emerald-700' },
  possible: { label: 'Possible', cls: 'bg-amber-100 text-amber-700' },
  not_a_fit: { label: 'Not a fit', cls: 'bg-rose-100 text-rose-700' },
};

export function RecommendationBadge({ value }: { value: Recommendation | null }) {
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  const meta = RECOMMENDATION_META[value];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

const STAGE_META: Record<CandidateStage, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-slate-100 text-slate-600' },
  shortlisted: { label: 'Shortlisted', cls: 'bg-brand-100 text-brand-700' },
  interviewing: { label: 'Interviewing', cls: 'bg-violet-100 text-violet-700' },
  hired: { label: 'Hired', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700' },
};

export function StageBadge({ value }: { value: CandidateStage }) {
  const meta = STAGE_META[value];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function AnalysisStatusBadge({ value }: { value: AnalysisStatus }) {
  const map: Record<AnalysisStatus, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600' },
    processing: { label: 'Analyzing…', cls: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Analyzed', cls: 'bg-emerald-100 text-emerald-700' },
    failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700' },
  };
  const meta = map[value];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const cls =
    kind === 'error'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : kind === 'success'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-brand-50 text-brand-700 border-brand-200';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export const STAGES: CandidateStage[] = ['new', 'shortlisted', 'interviewing', 'hired', 'rejected'];

const SOURCE_META: Record<string, { label: string; cls: string }> = {
  indeed: { label: 'Indeed', cls: 'bg-blue-100 text-blue-700' },
  linkedin: { label: 'LinkedIn', cls: 'bg-sky-100 text-sky-700' },
  jobstreet: { label: 'JobStreet', cls: 'bg-orange-100 text-orange-700' },
  glassdoor: { label: 'Glassdoor', cls: 'bg-emerald-100 text-emerald-700' },
  referral: { label: 'Referral', cls: 'bg-violet-100 text-violet-700' },
  direct: { label: 'Direct', cls: 'bg-slate-100 text-slate-600' },
};

export function formatSource(source: string): string {
  return (
    SOURCE_META[source]?.label ??
    source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source];
  const cls = meta?.cls ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {meta?.label ?? formatSource(source)}
    </span>
  );
}
