import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export interface AuditEntry {
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
  ip?: string | null;
}

/** Record an HR/system action. Fire-and-forget — never throws or blocks the request. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      detail: entry.detail ?? null,
      ip: entry.ip ?? null,
    });
  } catch (err) {
    logger.warn({ err, action: entry.action }, 'audit write failed');
  }
}
