import { describe, it, expect } from 'vitest';
import * as OTPAuth from 'otpauth';
import { createTotpSecret, totpAuthUrl, verifyTotp } from './totp.js';

describe('totp', () => {
  it('creates a base32 secret', () => {
    expect(createTotpSecret()).toMatch(/^[A-Z2-7]+$/);
  });

  it('verifies a freshly generated code and rejects a wrong one', () => {
    const secret = createTotpSecret();
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    expect(verifyTotp('hr@example.com', secret, totp.generate())).toBe(true);
    expect(verifyTotp('hr@example.com', secret, '000001')).toBe(false);
  });

  it('builds an otpauth:// URL for authenticator apps', () => {
    expect(totpAuthUrl('hr@example.com', createTotpSecret())).toMatch(/^otpauth:\/\/totp\//);
  });
});
