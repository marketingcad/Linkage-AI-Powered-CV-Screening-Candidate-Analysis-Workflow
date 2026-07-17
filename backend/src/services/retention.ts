import { and, eq, lt, sql } from 'drizzle-orm';
import { candidates } from '../db/schema.js';
import { client, db } from '../db/client.js';
import { env } from '../config/env.js';
import { deleteCvFile } from './storage.js';
import { recordAudit } from './audit.js';
import { logger } from '../lib/logger.js';

const REDACTED = '[redacted]';

/** PII fields cleared when a candidate is anonymized (scores/stage/source kept for stats). */
export function anonymizedFields() {
  return {
    fullName: REDACTED,
    email: REDACTED,
    phone: null,
    location: null,
    currentTitle: null,
    linkedinUrl: null,
    portfolioUrl: null,
    coverNote: null,
    cvText: null,
    cvStoragePath: null,
    cvFilename: null,
    updatedAt: new Date(),
  } satisfies Partial<typeof candidates.$inferInsert>;
}

/**
 * Anonymize candidates whose application is older than DATA_RETENTION_DAYS (excludes
 * hired candidates and those already redacted). Returns how many were purged.
 */
export async function purgeOldCandidates(): Promise<number> {
  const days = env.DATA_RETENTION_DAYS;
  if (!days || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ id: candidates.id, cvStoragePath: candidates.cvStoragePath })
    .from(candidates)
    .where(
      and(
        lt(candidates.createdAt, cutoff),
        sql`${candidates.stage} <> 'hired'`,
        sql`${candidates.email} <> ${REDACTED}`,
      ),
    );

  for (const r of rows) {
    await deleteCvFile(r.cvStoragePath);
    await db.update(candidates).set(anonymizedFields()).where(eq(candidates.id, r.id));
    await client`UPDATE candidates SET embedding = NULL WHERE id = ${r.id}`;
  }
  return rows.length;
}

/** Kick off a daily retention sweep when a retention window is configured. */
export function startRetentionSweeper(): void {
  if (!env.DATA_RETENTION_DAYS || env.DATA_RETENTION_DAYS <= 0) return;
  const run = () =>
    purgeOldCandidates()
      .then((n) => {
        if (n > 0) {
          logger.info({ purged: n }, 'retention sweep');
          void recordAudit({
            action: 'retention.purge',
            detail: `${n} candidate(s) anonymized (older than ${env.DATA_RETENTION_DAYS} days)`,
          });
        }
      })
      .catch((err) => logger.error({ err }, 'retention sweep failed'));

  run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref?.();
  logger.info({ days: env.DATA_RETENTION_DAYS }, 'retention sweeper enabled');
}
