import { Router } from 'express';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { hrUsers } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { hashPassword } from '../lib/auth.js';
import { ROLES, normalizeRole } from '../lib/roles.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { idParams, validate } from '../middleware/validate.js';
import { createTeamMemberSchema, updateTeamMemberSchema } from '../lib/validation.js';
import { recordAudit } from '../services/audit.js';

export const teamRouter = Router();

// Managing who can access the hiring pipeline is an admin-only concern.
teamRouter.use(requireAuth, requireRole('admin'));

/** Never expose password hashes or TOTP secrets. */
const selection = {
  id: hrUsers.id,
  email: hrUsers.email,
  name: hrUsers.name,
  role: hrUsers.role,
  avatarUrl: hrUsers.avatarUrl,
  totpEnabled: hrUsers.totpEnabled,
  createdAt: hrUsers.createdAt,
};

/** How many admins remain besides `excludeId` — used to prevent locking everyone out. */
async function otherAdminCount(excludeId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hrUsers)
    .where(and(eq(hrUsers.role, 'admin'), ne(hrUsers.id, excludeId)));
  return row?.n ?? 0;
}

teamRouter.get('/', async (_req, res) => {
  const members = await db.select(selection).from(hrUsers).orderBy(asc(hrUsers.createdAt));
  res.json({ members, roles: ROLES });
});

/** Add a teammate with an initial password they can change after signing in. */
teamRouter.post('/', async (req, res) => {
  const input = createTeamMemberSchema.parse(req.body);
  const email = input.email.trim().toLowerCase();

  const [existing] = await db.select({ id: hrUsers.id }).from(hrUsers).where(eq(hrUsers.email, email)).limit(1);
  if (existing) throw conflict('Someone with that email is already on the team.');

  const [created] = await db
    .insert(hrUsers)
    .values({
      email,
      name: input.name.trim(),
      role: normalizeRole(input.role),
      passwordHash: await hashPassword(input.password),
    })
    .returning(selection);
  if (!created) throw new Error('Failed to create team member');

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'team.create',
    targetType: 'hr_user',
    targetId: created.id,
    detail: `Added ${created.email} as ${created.role}`,
    ip: req.ip ?? null,
  });

  res.status(201).json({ member: created });
});

/** Change a teammate's name or role. */
teamRouter.patch('/:id', validate({ params: idParams }), async (req, res) => {
  const input = updateTeamMemberSchema.parse(req.body);
  const targetId = req.params.id;

  const [target] = await db.select(selection).from(hrUsers).where(eq(hrUsers.id, targetId)).limit(1);
  if (!target) throw notFound('Team member not found');

  // Don't let the last admin demote themselves into a locked-out org.
  if (input.role && normalizeRole(input.role) !== 'admin' && normalizeRole(target.role) === 'admin') {
    if ((await otherAdminCount(targetId)) === 0) {
      throw badRequest('There must be at least one admin. Promote someone else first.');
    }
  }

  const [updated] = await db
    .update(hrUsers)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.role !== undefined ? { role: normalizeRole(input.role) } : {}),
    })
    .where(eq(hrUsers.id, targetId))
    .returning(selection);
  if (!updated) throw notFound('Team member not found');

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'team.update',
    targetType: 'hr_user',
    targetId: updated.id,
    detail: `Updated ${updated.email}${input.role ? ` → ${updated.role}` : ''}`,
    ip: req.ip ?? null,
  });

  res.json({ member: updated });
});

/** Remove a teammate. Their authored notes stay (author_id is set null on delete). */
teamRouter.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.user!.sub) {
    throw badRequest('You cannot remove your own account.');
  }

  const [target] = await db.select(selection).from(hrUsers).where(eq(hrUsers.id, targetId)).limit(1);
  if (!target) throw notFound('Team member not found');

  if (normalizeRole(target.role) === 'admin' && (await otherAdminCount(targetId)) === 0) {
    throw badRequest('There must be at least one admin.');
  }

  await db.delete(hrUsers).where(eq(hrUsers.id, targetId));

  void recordAudit({
    actorEmail: req.user?.email ?? null,
    action: 'team.delete',
    targetType: 'hr_user',
    targetId,
    detail: `Removed ${target.email}`,
    ip: req.ip ?? null,
  });

  res.json({ ok: true });
});
