import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';
import { LuRefreshCw, LuTriangleAlert } from 'react-icons/lu';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Anything can be thrown, so narrow it to something we can put on screen. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/**
 * The screen a recruiter actually sees when something breaks.
 *
 * Shared by both boundaries below so a crash looks the same wherever it is caught.
 */
function ErrorFallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-(--shadow-card)">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <LuTriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="font-display text-lg font-semibold text-slate-900">
          Something went wrong on this page
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          Nothing you were working on has been lost — this is a display problem, not a saving one.
          Reloading usually clears it.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            <LuRefreshCw className="h-4 w-4" />
            Reload the page
          </button>
          {/* A hard navigation rather than a router link: the router is part of what just
              failed, so it cannot be trusted to move anyone anywhere. */}
          <a
            href="/hr"
            className="inline-flex items-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          >
            Back to dashboard
          </a>
        </div>

        {/* The message only — never the stack. It is on screen, and a stack trace on a
            recruiter's monitor is noise to them and detail to anyone behind them. */}
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
          If it keeps happening, quote this: <span className="font-mono">{message}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * The route-level boundary — the one that does the real work.
 *
 * react-router catches render errors inside a route itself and, with no `errorElement`,
 * shows its own developer screen: "Unexpected Application Error!" over a raw stack trace.
 * That fires before any boundary wrapping the RouterProvider, so the class below never sees
 * a page crash. Wiring this as `errorElement` is what actually replaces that screen.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error('Route render error:', error);
  return <ErrorFallback message={messageOf(error)} />;
}

/**
 * The outermost net, for what the router cannot catch.
 *
 * Route render errors are handled by {@link RouteErrorBoundary} above. This one covers the
 * rest of the tree — the auth provider, the router itself failing to mount — where a throw
 * would otherwise unmount everything and leave a recruiter staring at white with no message
 * and no way back except guessing at the URL.
 *
 * A class component because there is still no hook equivalent; `componentDidCatch` is the
 * only way to catch errors thrown during render.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Without an error tracker the console is the only record; keep the component stack,
    // which is what actually identifies where this came from.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback message={error.message} />;
  }
}
