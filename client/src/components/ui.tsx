import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { AnalysisStatus, CandidateStage, Recommendation } from '../api/types';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-500">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button — consistent variants across the app
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.98]';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-white shadow-[0_1px_2px_rgba(28,45,110,0.25)] hover:bg-brand-600 hover:shadow-[0_6px_18px_-6px_rgba(51,88,240,0.65)]',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-300',
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-(--shadow-card)">
      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <Skeleton className="h-4 w-40" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-50 px-4 py-4 last:border-0">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
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
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-(--shadow-card) ${className}`}
    >
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

export function aiLevel(likelihood: number | null | undefined): {
  label: string;
  cls: string;
  tone: 'low' | 'medium' | 'high';
} {
  if (likelihood == null) return { label: 'Not assessed', cls: 'bg-slate-100 text-slate-500', tone: 'low' };
  if (likelihood >= 70)
    return { label: 'Likely AI-written', cls: 'bg-rose-100 text-rose-700', tone: 'high' };
  if (likelihood >= 40)
    return { label: 'Possibly AI-written', cls: 'bg-amber-100 text-amber-700', tone: 'medium' };
  return { label: 'Likely human-written', cls: 'bg-emerald-100 text-emerald-700', tone: 'low' };
}

/** Small robot/sparkle glyph for the AI-written signal. */
function AiGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="8" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 4v4M8.5 12.5h.01M15.5 12.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 16c.8.6 4.2.6 6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function AiWrittenBadge({
  likelihood,
  size = 'sm',
}: {
  likelihood: number | null | undefined;
  size?: 'sm' | 'md';
}) {
  if (likelihood == null) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const meta = aiLevel(likelihood);
  const pad = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${meta.cls} ${pad}`}
      title={`${meta.label} — estimated ${likelihood}% AI-generated (heuristic, not definitive)`}
    >
      <AiGlyph />
      AI-written ~{likelihood}%
    </span>
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
