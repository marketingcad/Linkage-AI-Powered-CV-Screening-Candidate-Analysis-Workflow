import { useSyncExternalStore } from 'react';

/**
 * How many API requests are in flight right now.
 *
 * The progress bar is driven by this rather than by a timer, so it reflects what the app is
 * actually waiting on. A bar animated on a guess either finishes while the data is still
 * loading — which reads as "done" when nothing is — or crawls after a fast response.
 */
let active = 0;
/** Bumped when navigation starts, before any request exists, so the bar reacts to the click. */
let navPending = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot must be a stable primitive — returning a fresh object would loop forever. */
function snapshot(): boolean {
  return active > 0 || navPending;
}

/**
 * Set while a background poll is being kicked off, so it is not counted.
 *
 * The notification bell and the interview reminder both poll every 60 seconds. Counting those
 * would flash the progress bar once a minute forever, for work nobody asked for — training the
 * user to ignore the one signal that is supposed to mean "your click is being handled".
 *
 * Reading it is safe despite being module-level state: `apiRequest` increments synchronously
 * before its first await, so the flag is still set for the call it belongs to and cleared
 * before any other code runs.
 */
let suppressed = false;

/** Run an API call without it driving the progress bar. For polling and prefetching only. */
export function silently<T>(fn: () => Promise<T>): Promise<T> {
  suppressed = true;
  try {
    return fn();
  } finally {
    suppressed = false;
  }
}

/** Whether the request starting right now should be counted. */
export function shouldCount(): boolean {
  return !suppressed;
}

export function startRequest() {
  active += 1;
  emit();
}

export function endRequest() {
  // Clamped: a double-settled promise must not drive the counter negative, which would leave
  // the bar stuck visible on every later request.
  active = Math.max(0, active - 1);
  emit();
}

/**
 * Marks a route change as pending. Cleared once a request starts (the page is fetching, so
 * the counter takes over) or after a short grace period for pages that fetch nothing.
 */
export function startNavigation() {
  navPending = true;
  emit();
  window.setTimeout(() => {
    navPending = false;
    emit();
  }, 400);
}

/** True while the app is waiting on the network or a route change. */
export function useIsBusy(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
