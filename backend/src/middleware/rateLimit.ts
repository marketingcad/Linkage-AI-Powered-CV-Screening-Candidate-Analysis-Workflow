import rateLimit, { type Options } from 'express-rate-limit';

/**
 * Shared rate limiters. Public and credential-handling endpoints must be bounded:
 * without this, passwords and 6-digit TOTP codes are brute-forceable and the public
 * AI endpoints can be used to run up Gemini spend.
 */
function limiter(windowMs: number, limit: number, message: string): ReturnType<typeof rateLimit> {
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  };
  return rateLimit(options);
}

/**
 * Credentials: login, 2FA verification, password change. Deliberately tight — a
 * legitimate user needs a handful of attempts, an attacker needs thousands.
 */
export const authLimiter = limiter(
  15 * 60 * 1000,
  10,
  'Too many attempts. Please wait a few minutes and try again.',
);

/** Public form submissions (CV upload → parse → AI). Each request costs real money. */
export const publicSubmitLimiter = limiter(
  15 * 60 * 1000,
  20,
  'Too many requests from this device. Please try again in a few minutes.',
);

/** Public read-only endpoints (status lookups, interview context). Cheap but not free. */
export const publicReadLimiter = limiter(
  15 * 60 * 1000,
  100,
  'Too many requests. Please try again shortly.',
);
