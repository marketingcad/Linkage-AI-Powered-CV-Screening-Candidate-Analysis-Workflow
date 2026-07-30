import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

/**
 * A tiny signed, time-gated token for scheduled interviews.
 *
 * The link HR hands the candidate carries this token; the server verifies the signature
 * and that "now" falls inside the interview's join window before it will create a room.
 * (Production reuses your app's JWT + the interviews table instead of this standalone HMAC.)
 */
export interface SchedulePayload {
  candidateName: string;
  scheduledAt: string; // ISO instant
  durationMinutes: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function sign(data: string): string {
  return b64url(createHmac('sha256', config.scheduleSecret).update(data).digest());
}

export function signScheduleToken(payload: SchedulePayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

export type VerifyResult =
  | { valid: true; payload: SchedulePayload }
  | { valid: false; reason: string };

export function verifyScheduleToken(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed link' };
  const [body, sig] = parts;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'invalid signature' };
  }
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as SchedulePayload;
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'malformed payload' };
  }
}

/**
 * Returns null when `now` is inside the join window, otherwise a machine-readable reason:
 * 'too_early' (before the lead-in) or 'expired' (after scheduledAt + duration).
 */
export function windowError(payload: SchedulePayload, now: number): 'too_early' | 'expired' | 'invalid_time' | null {
  const start = new Date(payload.scheduledAt).getTime();
  if (Number.isNaN(start)) return 'invalid_time';
  const opensAt = start - config.scheduleLeadMinutes * 60_000;
  const closesAt = start + payload.durationMinutes * 60_000;
  if (now < opensAt) return 'too_early';
  if (now > closesAt) return 'expired';
  return null;
}
