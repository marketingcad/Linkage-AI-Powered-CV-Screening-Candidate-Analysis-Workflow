import { Link } from 'react-router-dom';

/**
 * Shared header for the public (candidate-facing) pages — mirrors the HR header's
 * professional lockup so both sides feel like one product.
 *
 * Public pages stay candidate-only: no dashboard/admin controls are shown here, even
 * to a signed-in recruiter. Recruiters reach the dashboard via /hr directly.
 */
export default function PublicHeader({ container = 'max-w-4xl' }: { container?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className={`mx-auto flex h-16 items-center justify-between px-6 ${container}`}>
        <Link to="/apply" className="flex items-center gap-2.5">
          <img
            src="/Favicon_Linkage.png"
            alt="Linkage ScreenAI"
            className="h-9 w-9 rounded-xl object-contain"
          />
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-semibold text-slate-900">Linkage ScreenAI</span>
            <span className="text-[11px] font-medium tracking-wide text-slate-400">Careers</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
