import { describe, it, expect } from 'vitest';
import {
  changePasswordSchema,
  loginSchema,
  totpCodeSchema,
  updateProfileSchema,
} from './validation.js';

describe('loginSchema', () => {
  it('accepts a valid login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
  it('rejects a malformed email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('requires a new password of at least 8 characters', () => {
    expect(
      changePasswordSchema.safeParse({ oldPassword: 'a', newPassword: 'short' }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ oldPassword: 'a', newPassword: 'longenough' }).success,
    ).toBe(true);
  });
});

describe('totpCodeSchema', () => {
  it('accepts exactly six digits', () => {
    expect(totpCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
  });
  it('rejects wrong-length or non-numeric codes', () => {
    expect(totpCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('rejects an empty update', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });
  it('accepts a name-only update', () => {
    expect(updateProfileSchema.safeParse({ name: 'Jane Doe' }).success).toBe(true);
  });
  it('rejects a non-image avatar data URL', () => {
    expect(
      updateProfileSchema.safeParse({ avatarUrl: 'data:text/plain;base64,AAAA' }).success,
    ).toBe(false);
  });
  it('accepts an image avatar data URL', () => {
    expect(
      updateProfileSchema.safeParse({ avatarUrl: 'data:image/jpeg;base64,AAAA' }).success,
    ).toBe(true);
  });
});
