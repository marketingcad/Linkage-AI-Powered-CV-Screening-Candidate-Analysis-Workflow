import { Link } from 'react-router-dom';
import { LuLayoutDashboard } from 'react-icons/lu';
import { useAuth } from '../auth/AuthContext';

/**
 * Shared header for the public (candidate-facing) pages — mirrors the HR header's
 * professional lockup so both sides feel like one product.
 *
 * The action button is auth-aware: candidates/public visitors see nothing, while a
 * signed-in recruiter gets a quick link back to the dashboard.
 */
export default function PublicHeader({ container = 'max-w-4xl' }: { container?: string }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className={`mx-auto flex h-16 items-center justify-between px-6 ${container}`}>
        <Link to="/apply" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-[0_4px_12px_-3px_rgba(51,88,240,0.6)]">
            CV
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-semibold text-slate-900">ScreenAI</span>
            <span className="text-[11px] font-medium tracking-wide text-slate-400">Careers</span>
          </span>
        </Link>

        {user && (
          <Link
            to="/hr"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <LuLayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        )}
      </div>
    </header>
  );
}
