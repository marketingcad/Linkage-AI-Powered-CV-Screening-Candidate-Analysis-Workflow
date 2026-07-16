import * as OTPAuth from 'otpauth';

const ISSUER = 'Linkage ScreenAI';

/** Generate a fresh base32 TOTP shared secret. */
export function createTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totpFor(email: string, secretBase32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** otpauth:// URI to encode into a QR code for authenticator apps. */
export function totpAuthUrl(email: string, secretBase32: string): string {
  return totpFor(email, secretBase32).toString();
}

/** Verify a 6-digit code, allowing ±1 time step (30s) of clock drift. */
export function verifyTotp(email: string, secretBase32: string, token: string): boolean {
  return totpFor(email, secretBase32).validate({ token, window: 1 }) !== null;
}
