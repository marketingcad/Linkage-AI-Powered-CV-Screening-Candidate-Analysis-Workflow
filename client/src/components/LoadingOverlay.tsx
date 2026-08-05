import { LuLoaderCircle } from 'react-icons/lu';

/**
 * A veil and spinner over the region that is changing.
 *
 * Drop it inside any `relative` container — a table wrapper, a card, a panel — to show that
 * its contents are being replaced. Because it covers only that region, the rest of the page
 * stays usable, which a full-screen blocker would not allow.
 *
 * The veil is translucent on purpose: the shape of what is underneath stays visible, so the
 * user keeps their place instead of watching the content disappear and come back.
 */
export default function LoadingOverlay({
  show,
  label = 'Loading',
  rounded = 'rounded-2xl',
}: {
  show: boolean;
  /** Announced to screen readers, and shown beside the spinner. */
  label?: string;
  /** Match the corner radius of the container so the veil doesn't square off its edges. */
  rounded?: string;
}) {
  return (
    <div
      // Kept mounted and faded so it can't flash a hard rectangle on and off.
      className={`pointer-events-none absolute inset-0 z-20 flex items-start justify-center bg-white/60 backdrop-blur-[1px] transition-opacity duration-200 dark:bg-slate-900/50 ${rounded} ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!show}
    >
      <div
        role="status"
        aria-live="polite"
        className={`mt-16 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-(--shadow-raised) ring-1 ring-slate-200/80 transition-transform duration-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 ${
          show ? 'translate-y-0 scale-100' : '-translate-y-1 scale-95'
        }`}
      >
        <LuLoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-500" />
        {label}
      </div>
    </div>
  );
}
