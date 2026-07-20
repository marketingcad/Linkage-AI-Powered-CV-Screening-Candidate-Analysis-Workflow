import { useEffect, useRef, useState } from 'react';
import { LuLoaderCircle, LuMoon, LuSun } from 'react-icons/lu';

function isDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Light/dark theme toggle. On click it shows a brief loading beat, then switches
 * with a smooth animated transition — a circular "reveal" of the new theme (via the
 * View Transitions API) where supported, or a global colour cross-fade otherwise.
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(isDark);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setDark(isDark()), []);

  function applyTheme(next: boolean) {
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }

  function switchTheme(next: boolean) {
    const root = document.documentElement;
    const reduced = prefersReducedMotion();
    // Reveal origin = center of the toggle button.
    const rect = btnRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 40;
    const y = rect ? rect.top + rect.height / 2 : 24;

    const startViewTransition = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void> };
      }
    ).startViewTransition;

    if (startViewTransition && !reduced) {
      const transition = startViewTransition.call(document, () => applyTheme(next));
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      transition.ready
        .then(() => {
          root.animate(
            {
              clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
            },
            {
              duration: 520,
              easing: 'ease-in-out',
              pseudoElement: '::view-transition-new(root)',
            },
          );
        })
        .catch(() => {
          /* ignore */
        });
    } else if (!reduced) {
      // Fallback: brief global colour cross-fade.
      root.classList.add('theme-transition');
      applyTheme(next);
      window.setTimeout(() => root.classList.remove('theme-transition'), 520);
    } else {
      applyTheme(next);
    }
  }

  function toggle() {
    if (loading) return;
    const next = !dark;
    setLoading(true);
    // A short "loading" beat, then the smooth transition.
    window.setTimeout(() => {
      switchTheme(next);
      setLoading(false);
    }, 260);
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-busy={loading}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-80"
      disabled={loading}
    >
      {loading ? (
        <LuLoaderCircle className="h-5 w-5 animate-spin text-brand-500" />
      ) : (
        <>
          <LuSun
            className={`absolute h-5 w-5 transition-all duration-300 ${
              dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
            }`}
          />
          <LuMoon
            className={`absolute h-5 w-5 transition-all duration-300 ${
              dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
            }`}
          />
        </>
      )}
    </button>
  );
}
