import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

const SALT_ROUNDS = 10;

export type JwtPayload = {
  sub: string; // hr user id
  email: string;
  name: string;
  role: string;
};

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

// --- Short-lived token issued between the password step and the 2FA step ---

export function signMfaToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'mfa' }, env.JWT_SECRET, { expiresIn: '5m' });
}

export function verifyMfaToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; typ?: string };
  if (payload.typ !== 'mfa') throw new Error('Not an MFA token');
  return payload.sub;
}
