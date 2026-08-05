import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { startNavigation, useIsBusy } from '../lib/loading';

/** Wait this long after the last request before declaring the app idle. */
const SETTLE_MS = 250;
/** Don't show anything for work that finishes faster than this. */
const APPEAR_AFTER_MS = 180;

/**
 * The thin gradient bar across the top of the app while it is loading.
 *
 * Three rules make it feel honest rather than decorative:
 *
 * 1. It waits ~180ms before appearing. Most calls here return faster than that, and a bar that
 *    flashes on every quick response reads as jank rather than as feedback.
 * 2. It never reaches 100% on its own — it eases toward 90% in shrinking steps, so slow work
 *    looks like progress without ever claiming to be finished. Only real completion fills it.
 * 3. A page that fires several requests is one continuous run. Completing on each gap made it
 *    snap to 100% and restart from 8% mid-load, which reads as "done — no wait, not done".
 *    A short settle window merges them.
 *
 * Visibility is tracked in a ref as well as state: the effect only depends on `busy`, so a
 * `visible` read from its closure would be whatever it was when loading started.
 */
export default function RouteProgress() {
  const busy = useIsBusy();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const visibleRef = useRef(false);
  const showTimer = useRef<number | undefined>(undefined);
  const creepTimer = useRef<number | undefined>(undefined);
  const settleTimer = useRef<number | undefined>(undefined);
  const finishTimers = useRef<number[]>([]);

  // Clicking a nav link should react immediately, before the new page has mounted and asked
  // for anything.
  useEffect(() => {
    startNavigation();
  }, [location.pathname]);

  useEffect(() => {
    const show = (v: boolean) => {
      visibleRef.current = v;
      setVisible(v);
    };

    if (busy) {
      // A continuation of the same run: cancel any completion that was queued during the gap.
      window.clearTimeout(settleTimer.current);
      settleTimer.current = undefined;
      finishTimers.current.forEach(window.clearTimeout);
      finishTimers.current = [];

      if (showTimer.current === undefined && creepTimer.current === undefined) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = undefined;
          show(true);
          setProgress(8);
          creepTimer.current = window.setInterval(() => {
            // Shrinking increments: quick to 50%, crawling by 85%, asymptotic to 90%.
            setProgress((p) => (p >= 90 ? p : p + Math.max(0.4, (90 - p) / 12)));
          }, 220);
        }, APPEAR_AFTER_MS);
      }
      return;
    }

    // Idle — but hold briefly in case another request is about to start.
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = undefined;
      window.clearTimeout(showTimer.current);
      showTimer.current = undefined;
      window.clearInterval(creepTimer.current);
      creepTimer.current = undefined;

      if (!visibleRef.current) {
        // Finished inside the appear delay: nothing was ever shown, so nothing to wind down.
        setProgress(0);
        return;
      }
      setProgress(100);
      finishTimers.current = [
        window.setTimeout(() => show(false), 260),
        window.setTimeout(() => setProgress(0), 560),
      ];
    }, SETTLE_MS);
  }, [busy]);

  // Only on unmount — the effect above deliberately keeps its timers across re-runs.
  useEffect(
    () => () => {
      window.clearTimeout(showTimer.current);
      window.clearInterval(creepTimer.current);
      window.clearTimeout(settleTimer.current);
      finishTimers.current.forEach(window.clearTimeout);
    },
    [],
  );

  return (
    <div
      aria-hidden="true"
      data-testid="route-progress"
      className={`pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="h-full rounded-r-full bg-linear-to-r from-brand-500 via-violet-500 to-brand-400 shadow-[0_0_10px_1px_rgba(51,88,240,0.6)] transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
