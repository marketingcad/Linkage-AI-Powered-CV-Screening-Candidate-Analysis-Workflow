import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken, type JwtPayload } from '../lib/auth.js';
import { normalizeRole, type Role } from '../lib/roles.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    return next(unauthorized('Missing authentication token'));
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
}

/**
 * Restrict a route to the given roles. Always mount after `requireAuth`.
 *
 *   router.delete('/:id', requireRole('admin'), handler)
 *
 * The role is read from the verified JWT. It's re-issued on profile update and login, so a
 * demoted user loses access as soon as their token is refreshed or expires.
 */
// Typed permissively so Express keeps inferring route params from the path string
// (with noUncheckedIndexedAccess, a narrower handler type turns `req.params.id` into
// `string | undefined` in every route this is mounted on).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function requireRole(...allowed: Role[]): RequestHandler<any, any, any, any> {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized('Missing authentication token'));
    if (!allowed.includes(normalizeRole(req.user.role))) {
      return next(forbidden('You do not have permission to do that.'));
    }
    return next();
  };
}
