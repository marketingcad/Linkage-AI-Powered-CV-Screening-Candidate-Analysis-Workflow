import { Skeleton } from './ui/skeleton';

/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * These replace centred "Loading…" spinners. A spinner tells you to wait but not what for, and
 * when the data lands the real layout appears from nothing and everything jumps. A skeleton
 * that matches the page reserves the same space, so arriving content simply fills in.
 *
 * Every block carries `skeleton-shimmer`, which is disabled under prefers-reduced-motion.
 */

/** One grey block. Use directly for one-off shapes. */
export function Bar({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <Skeleton className={`skeleton-shimmer ${className}`} style={style} />;
}

/** Page title + subtitle, matching the standard page header. */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Bar className="h-7 w-44 rounded-lg" />
        <Bar className="h-3.5 w-72 rounded" />
      </div>
      {action && <Bar className="h-9 w-28 rounded-lg" />}
    </div>
  );
}

/** The four KPI tiles on the overview. */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-(--shadow-card)"
        >
          <Bar className="h-9 w-9 rounded-xl" />
          <Bar className="mt-4 h-7 w-16 rounded" />
          <Bar className="mt-2 h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Rows of filter pills above a list. */
export function FiltersSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-(--shadow-card)">
      <div className="flex flex-wrap gap-2">
        {[56, 72, 96, 68, 64, 80].map((w, i) => (
          <Bar key={i} className="h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Bar className="h-9 flex-1 rounded-lg" />
        <Bar className="h-9 w-36 rounded-lg" />
        <Bar className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}

/** The candidate kanban: six stage columns with a few cards in the first ones. */
export function BoardSkeleton() {
  const perColumn = [3, 2, 1, 0, 0, 1];
  return (
    <div className="flex gap-4 overflow-hidden pb-4 xl:grid xl:grid-cols-6 xl:gap-3 xl:pb-0">
      {perColumn.map((n, col) => (
        <div
          key={col}
          className="flex w-72 shrink-0 flex-col rounded-2xl border border-slate-200/70 bg-slate-50/60 xl:w-auto xl:min-w-0"
        >
          <div className="flex items-center justify-between px-4 py-3 xl:px-2.5">
            <div className="flex items-center gap-2">
              <Bar className="h-2.5 w-2.5 rounded-full" />
              <Bar className="h-3.5 w-20 rounded" />
            </div>
            <Bar className="h-5 w-6 rounded-full" />
          </div>
          <div className="flex min-h-24 flex-col gap-2.5 px-3 pb-3 xl:gap-2 xl:px-2">
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <Bar className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Bar className="h-3.5 w-full rounded" />
                    <Bar className="h-2.5 w-3/4 rounded" />
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Bar className="h-5 w-20 rounded-full" />
                  <Bar className="h-5 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A stack of cards — used by Recordings, Team, and the scheduler side panel. */
export function CardListSkeleton({
  rows = 4,
  columns = 1,
}: {
  rows?: number;
  columns?: 1 | 2 | 3;
}) {
  const grid =
    columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : '';
  return (
    <div className={`grid gap-4 ${grid}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-(--shadow-card)"
        >
          <div className="flex items-center gap-3">
            <Bar className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-3.5 w-1/2 rounded" />
              <Bar className="h-3 w-1/3 rounded" />
            </div>
            <Bar className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
