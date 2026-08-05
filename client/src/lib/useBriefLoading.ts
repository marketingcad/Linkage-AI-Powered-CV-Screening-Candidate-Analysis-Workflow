import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A loading flag that stays on for a guaranteed minimum.
 *
 * Some actions finish faster than the eye can register — paging a table is a slice of an array
 * already in memory. Without a floor, the indicator would appear and vanish in the same frame
 * and the click would feel like it did nothing. Holding it briefly makes the change legible.
 *
 * Keep the window short. This is confirmation that the click landed, not a fake progress bar,
 * and anything longer costs real time on every interaction.
 */
export function useBriefLoading(minMs = 320) {
  const [active, setActive] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const start = useCallback(() => {
    setActive(true);
    // Restart rather than stack: clicking Next three times quickly should end one window after
    // the last click, not three windows later.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setActive(false);
    }, minMs);
  }, [minMs]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return [active, start] as const;
}
