import { describe, it, expect } from 'vitest';
import { APPLICANT_STATUS, statusFor } from './applicantStatus.js';

describe('statusFor', () => {
  it('maps a known stage to its status', () => {
    expect(statusFor('hired')).toBe(APPLICANT_STATUS.hired);
  });
  it('falls back to "new" for an unknown stage', () => {
    expect(statusFor('bogus-stage')).toBe(APPLICANT_STATUS.new);
  });
  it('has a label + message for every stage', () => {
    for (const key of Object.keys(APPLICANT_STATUS)) {
      const s = statusFor(key);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.message.length).toBeGreaterThan(0);
    }
  });
});
