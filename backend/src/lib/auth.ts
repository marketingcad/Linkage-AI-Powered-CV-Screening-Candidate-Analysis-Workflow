import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

const SALT_ROUNDS = 10;

/**
 * Every token we mint carries a `typ` claim and every verifier asserts it.
 * Without this, tokens signed for a different purpose with the same secret
 * (the pre-2FA `mfa` token, or the candidate-facing `ai_interview` join link)
 * would be accepted as full HR session tokens.
 */
export const TOKEN_TYPES = {
  session: 'session',
  mfa: 'mfa',
  aiInterview: 'ai_interview',
} as const;

export type JwtPayload = {
  sub: string; // hr user id
  email: string;
  name: string;
  role: string;
  typ?: string; // 'session' — asserted by verifyToken
};

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ ...payload, typ: TOKEN_TYPES.session }, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  // Reject anything that isn't a full session token (e.g. an mfa or ai_interview token).
  if (payload.typ !== TOKEN_TYPES.session) throw new Error('Not a session token');
  return payload;
}

// --- Short-lived token issued between the password step and the 2FA step ---

export function signMfaToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: TOKEN_TYPES.mfa }, env.JWT_SECRET, { expiresIn: '5m' });
}

export function verifyMfaToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; typ?: string };
  if (payload.typ !== TOKEN_TYPES.mfa) throw new Error('Not an MFA token');
  return payload.sub;
}
