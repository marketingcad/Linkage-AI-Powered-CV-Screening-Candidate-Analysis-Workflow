import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const auditRouter = Router();

auditRouter.use(requireAuth);
// The activity log spans every user and record — admins only.
auditRouter.use(requireRole('admin'));

// Recent activity log (most recent first).
auditRouter.get('/', async (_req, res) => {
  const entries = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  res.json({ entries });
});
