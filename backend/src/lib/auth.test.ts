import { describe, expect, it } from 'vitest';
import { signMfaToken, signToken, verifyMfaToken, verifyToken } from './auth.js';

const user = { sub: 'user-1', email: 'hr@example.com', name: 'HR', role: 'admin' };

/**
 * Regression tests for a token-type-confusion bug: `verifyToken` only checked the
 * signature, so tokens minted for other purposes with the same secret were accepted
 * as full HR session tokens. That allowed (a) bypassing 2FA with the pre-2FA token
 * and (b) using a candidate's emailed interview join link to read the HR API.
 */
describe('token type isolation', () => {
  it('accepts a genuine session token', () => {
    const payload = verifyToken(signToken(user));
    expect(payload.sub).toBe(user.sub);
    expect(payload.typ).toBe('session');
  });

  it('rejects a pre-2FA mfa token used as a session token', () => {
    const mfa = signMfaToken(user.sub);
    expect(() => verifyToken(mfa)).toThrow(/session token/i);
  });

  it('still accepts the mfa token for its own verifier', () => {
    expect(verifyMfaToken(signMfaToken(user.sub))).toBe(user.sub);
  });

  it('rejects a session token used as an mfa token', () => {
    expect(() => verifyMfaToken(signToken(user))).toThrow(/MFA token/i);
  });

  it('rejects a token with no typ claim', () => {
    // Simulates a legacy/forged token that only carries user fields.
    const legacy = signMfaToken(user.sub).split('.').slice(0, 2).join('.');
    expect(() => verifyToken(legacy)).toThrow();
  });

  it('rejects a garbage token', () => {
    expect(() => verifyToken('not.a.token')).toThrow();
  });
});
