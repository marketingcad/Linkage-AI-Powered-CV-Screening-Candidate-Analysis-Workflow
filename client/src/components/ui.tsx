import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { IconType } from 'react-icons';
import {
  LuBot,
  LuBriefcase,
  LuCalendarCheck,
  LuCircleAlert,
  LuCircleCheck,
  LuCircleHelp,
  LuClock,
  LuGlobe,
  LuInbox,
  LuLink,
  LuLoaderCircle,
  LuStar,
  LuThumbsDown,
  LuThumbsUp,
  LuTrophy,
  LuUserPlus,
  LuCircleX,
} from 'react-icons/lu';
import { SiGlassdoor, SiIndeed } from 'react-icons/si';
import { FaLinkedin } from 'react-icons/fa6';
import { Skeleton } from './ui/skeleton';
import type { AnalysisStatus, CandidateStage, Recommendation } from '../api/types';

// Re-export shadcn primitives so existing `@/components/ui` imports resolve to them.
export { Button, buttonVariants } from './ui/button';
export { Skeleton };

/** Icon per pipeline stage — shared by badges and the applicant status timeline. */
export const STAGE_ICONS: Record<CandidateStage, IconType> = {
  new: LuInbox,
  shortlisted: LuStar,
  interviewing: LuCalendarCheck,
  hired: LuTrophy,
  rejected: LuCircleX,
};

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-500">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

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
  const target = score ?? 0;
  // Sweep the ring + count the number up from 0 on mount (respects reduced motion).
  const [p, setP] = useState(0);
  useEffect(() => {
    if (score == null) {
      setP(0);
      return;
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setP(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800);
      setP(target * (1 - Math.pow(1 - t, 3))); // easeOutCubic
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, score]);

  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (p / 100) * circ;
  const stroke =
    score == null ? '#cbd5e1' : target >= 80 ? '#059669' : target >= 60 ? '#d97706' : '#e11d48';
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
        {score == null ? '—' : Math.round(p)}
      </span>
    </div>
  );
}

const RECOMMENDATION_META: Record<Recommendation, { label: string; cls: string; Icon: IconType }> = {
  strong_match: { label: 'Strong match', cls: 'bg-emerald-100 text-emerald-700', Icon: LuThumbsUp },
  possible: { label: 'Possible', cls: 'bg-amber-100 text-amber-700', Icon: LuCircleHelp },
  not_a_fit: { label: 'Not a fit', cls: 'bg-rose-100 text-rose-700', Icon: LuThumbsDown },
};

export function RecommendationBadge({ value }: { value: Recommendation | null }) {
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  const meta = RECOMMENDATION_META[value];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <meta.Icon className="h-3 w-3" />
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
  const Icon = STAGE_ICONS[value];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function AnalysisStatusBadge({ value }: { value: AnalysisStatus }) {
  const map: Record<AnalysisStatus, { label: string; cls: string; Icon: IconType; spin?: boolean }> = {
    pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600', Icon: LuClock },
    processing: { label: 'Analyzing…', cls: 'bg-amber-100 text-amber-700', Icon: LuLoaderCircle, spin: true },
    completed: { label: 'Analyzed', cls: 'bg-emerald-100 text-emerald-700', Icon: LuCircleCheck },
    failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700', Icon: LuCircleAlert },
  };
  const meta = map[value];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <meta.Icon className={`h-3 w-3 ${meta.spin ? 'animate-spin' : ''}`} />
      {meta.label}
    </span>
  );
}

export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-(--shadow-card) ${className}`}
      style={style}
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

const SOURCE_META: Record<string, { label: string; cls: string; Icon: IconType }> = {
  indeed: { label: 'Indeed', cls: 'bg-blue-100 text-blue-700', Icon: SiIndeed },
  linkedin: { label: 'LinkedIn', cls: 'bg-sky-100 text-sky-700', Icon: FaLinkedin },
  jobstreet: { label: 'JobStreet', cls: 'bg-orange-100 text-orange-700', Icon: LuBriefcase },
  glassdoor: { label: 'Glassdoor', cls: 'bg-emerald-100 text-emerald-700', Icon: SiGlassdoor },
  referral: { label: 'Referral', cls: 'bg-violet-100 text-violet-700', Icon: LuUserPlus },
  direct: { label: 'Direct', cls: 'bg-slate-100 text-slate-600', Icon: LuGlobe },
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
      <LuBot className="h-3.5 w-3.5" />
      AI-written ~{likelihood}%
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source];
  const cls = meta?.cls ?? 'bg-slate-100 text-slate-600';
  const Icon = meta?.Icon ?? LuLink;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {meta?.label ?? formatSource(source)}
    </span>
  );
}
