import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Public holidays for the calendar, from the Nager.Date open dataset.
 *
 * Fetched server-side rather than from the browser for three reasons: one cache serves the
 * whole team instead of every tab hitting a third party, no recruiter's IP is exposed to an
 * outside service, and a failure degrades to "no holidays shown" instead of a console error on
 * someone's screen.
 *
 * Holidays are decoration on a scheduling view, never a constraint — nothing in the app
 * refuses to book on one. So an outage here must stay silent.
 */

export type Holiday = { date: string; name: string };

type CacheEntry = { holidays: Holiday[]; expires: number };
const cache = new Map<string, CacheEntry>();

/** A year's holidays barely change; a miss costs a round trip nobody is waiting on. */
const OK_TTL_MS = 24 * 60 * 60 * 1000;
/** Failures are cached briefly too, so a flaky network cannot turn into a request storm. */
const FAIL_TTL_MS = 5 * 60 * 1000;

export function holidayCountry(): string {
  return (env.HOLIDAY_COUNTRY || 'PH').toUpperCase();
}

export async function getHolidays(year: number): Promise<Holiday[]> {
  const country = holidayCountry();
  const key = `${country}:${year}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.holidays;

  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const raw = (await res.json()) as { date: string; localName?: string; name?: string }[];
    const holidays = raw
      // localName first — "Araw ng Kagitingan" is what a Filipino recruiter recognises.
      .map((h) => ({ date: h.date, name: h.localName || h.name || 'Holiday' }))
      .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date));

    cache.set(key, { holidays, expires: Date.now() + OK_TTL_MS });
    return holidays;
  } catch (err) {
    logger.warn({ err: (err as Error).message, country, year }, '[holidays] lookup failed');
    // Serve a stale copy over nothing; otherwise an empty list, cached briefly.
    if (hit) return hit.holidays;
    cache.set(key, { holidays: [], expires: Date.now() + FAIL_TTL_MS });
    return [];
  }
}
