import { LuChevronLeft, LuChevronRight, LuLoaderCircle } from 'react-icons/lu';

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** Clamp a page number into range. Exported so callers can test their own paging maths. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, page), pages);
}

/**
 * Page-size picker, range readout, and prev/next.
 *
 * Deliberately shows the absolute range ("11–20 of 63") rather than just a page number: with a
 * changeable page size, "page 2" means nothing on its own.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  label = 'items',
  busy = false,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** Plural noun for the readout, e.g. "candidates". */
  label?: string;
  /**
   * Whether the new page is still rendering.
   *
   * Paging here is a slice of an array already in memory, so there is nothing to wait for on a
   * normal page turn and no indicator appears. This is driven by React's `useTransition`, which
   * only reports pending when the render genuinely takes long enough to notice — switching to
   * 100 rows, say. A spinner on every click would be theatre.
   */
  busy?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = clampPage(page, total, pageSize);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Show
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label={`${label} per page`}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-slate-600">
          {total === 0 ? `No ${label}` : `${first}–${last} of ${total} ${label}`}
          {busy && (
            <LuLoaderCircle
              aria-label="Loading"
              className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-500"
            />
          )}
        </span>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(current - 1)}
            disabled={busy || current <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LuChevronLeft className="h-3.5 w-3.5 shrink-0" />
            Prev
          </button>
          <span className="px-1 text-xs tabular-nums text-slate-600">
            Page {current} of {pages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(current + 1)}
            disabled={busy || current >= pages}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <LuChevronRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
