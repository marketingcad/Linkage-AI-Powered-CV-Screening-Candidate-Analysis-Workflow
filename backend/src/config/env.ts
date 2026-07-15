import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  // Supabase Postgres connection string (use the "Connection pooling" URI from
  // Supabase → Project Settings → Database).
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Google Gemini. The project uses GEMINI_API_KEY_CV_SCREENING; GEMINI_API_KEY
  // is accepted as a fallback for convenience.
  GEMINI_API_KEY_CV_SCREENING: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // CORS – comma separated list of allowed origins
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Public base URL of the frontend (used to build applicant tracking links in emails).
  // Falls back to the first CORS origin when unset.
  APP_PUBLIC_URL: z.string().optional(),

  // Email (SMTP). If SMTP_HOST is unset, emails are logged instead of sent (dev-safe).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('ScreenAI Careers <no-reply@screenai.local>'),

  // Local file storage for uploaded CVs
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(10),

  // Used only by the seed script
  SEED_HR_EMAIL: z.string().email().optional(),
  SEED_HR_PASSWORD: z.string().optional(),
  SEED_HR_NAME: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[env] Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export const geminiApiKey =
  env.GEMINI_API_KEY_CV_SCREENING ?? env.GEMINI_API_KEY ?? '';

if (!geminiApiKey) {
  // eslint-disable-next-line no-console
  console.error(
    '\n[env] Missing Gemini API key. Set GEMINI_API_KEY_CV_SCREENING (or GEMINI_API_KEY) in your .env.\n',
  );
  process.exit(1);
}

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Public frontend base URL for links inside emails.
export const appPublicUrl = (
  env.APP_PUBLIC_URL ?? corsOrigins[0] ?? 'http://localhost:5173'
).replace(/\/$/, '');

// Whether real email sending is configured.
export const emailEnabled = Boolean(env.SMTP_HOST);
