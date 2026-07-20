import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Short timezone label (e.g. "EDT", "GMT+8") for an instant in a given IANA zone. */
export function tzAbbrev(date: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** The viewer's own IANA timezone (e.g. "America/New_York"), best-effort. */
export function viewerTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Format an ISO instant as "Fri, Jul 25, 10:00 AM" in the given (or viewer's) zone. */
export function fmtInTz(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
