/**
 * Client-side field rules. Each returns an error message, or undefined when valid.
 *
 * These mirror the server's Zod schemas (`backend/src/lib/validation.ts`) so the user gets
 * an immediate, specific message instead of a round-trip. The server remains the source of
 * truth — client validation is UX, never a security boundary.
 */

/** Max lengths, kept in step with the backend schemas. */
export const LIMITS = {
  fullName: 255,
  email: 255,
  phone: 50,
  location: 255,
  currentTitle: 255,
  url: 512,
  noticePeriod: 100,
  expectedSalary: 100,
  coverNote: 5000,
  jobTitle: 255,
  jobDescription: 20_000,
  skill: 100,
  educationRequirement: 2000,
  quizPrompt: 2000,
  quizOption: 500,
  interviewTitle: 255,
  interviewLocation: 1000,
  notes: 5000,
  password: 200,
} as const;

export const required = (value: string | null | undefined, label = 'This field') =>
  !value || !value.trim() ? `${label} is required.` : undefined;

export const maxLen = (value: string | null | undefined, max: number, label = 'This field') =>
  value && value.length > max ? `${label} must be ${max} characters or fewer.` : undefined;

export const minLen = (value: string | null | undefined, min: number, label = 'This field') =>
  value && value.trim().length < min ? `${label} must be at least ${min} characters.` : undefined;

export const email = (value: string, opts: { required?: boolean } = {}) => {
  if (!value.trim()) return opts.required === false ? undefined : 'Email address is required.';
  // Deliberately permissive: catch obvious typos, let the server be authoritative.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())) {
    return 'Enter a valid email address, e.g. name@example.com.';
  }
  return maxLen(value, LIMITS.email, 'Email address');
};

/** http(s) only — matches the server, which rejects javascript:/data: URLs. */
export const httpUrl = (value: string, label = 'Link') => {
  const v = value.trim();
  if (!v) return undefined; // optional
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return `${label} must be a full URL starting with https://`;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return `${label} must start with http:// or https://`;
  }
  return maxLen(v, LIMITS.url, label);
};

export const phone = (value: string) => {
  const v = value.trim();
  if (!v) return undefined; // optional
  if (!/^[+()\d\s-]{6,}$/.test(v)) return 'Enter a valid phone number.';
  return maxLen(v, LIMITS.phone, 'Phone number');
};

export const intInRange = (
  value: string,
  { min, max, label = 'Value' }: { min: number; max: number; label?: string },
) => {
  const v = value.trim();
  if (!v) return undefined; // optional
  const n = Number(v);
  if (!Number.isInteger(n)) return `${label} must be a whole number.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return undefined;
};

export const fileRules = (
  file: File | null,
  { maxMb, accept, label = 'File' }: { maxMb: number; accept: RegExp; label?: string },
) => {
  if (!file) return `${label} is required.`;
  if (!accept.test(file.name)) return `${label} must be a PDF or DOCX.`;
  if (file.size > maxMb * 1024 * 1024) {
    return `${label} is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${maxMb} MB.`;
  }
  return undefined;
};

/** A datetime-local value that must parse and (optionally) not be in the past. */
export const dateTime = (
  value: string,
  { label = 'Date and time', allowPast = true }: { label?: string; allowPast?: boolean } = {},
) => {
  if (!value) return `${label} is required.`;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return `${label} is not a valid date.`;
  if (!allowPast && t < Date.now()) return `${label} cannot be in the past.`;
  return undefined;
};
