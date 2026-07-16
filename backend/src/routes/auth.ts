import { Router } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { hrUsers } from '../db/schema.js';
import {
  changePasswordSchema,
  loginSchema,
  updateProfileSchema,
} from '../lib/validation.js';
import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

/** Shape returned to the client — never includes the password hash. */
type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
};

function toPublicUser(u: {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}): PublicUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatarUrl };
}

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const [user] = await db
    .select()
    .from(hrUsers)
    .where(eq(hrUsers.email, email.toLowerCase()))
    .limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Invalid email or password');
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  res.json({ token, user: toPublicUser(user) });
});

// Current user — read from the DB so name/email/avatar are always fresh.
authRouter.get('/me', requireAuth, async (req, res) => {
  const [user] = await db
    .select()
    .from(hrUsers)
    .where(eq(hrUsers.id, req.user!.sub))
    .limit(1);

  if (!user) throw unauthorized('Account no longer exists');
  res.json({ user: toPublicUser(user) });
});

// Update profile (name / email / avatar). Re-issues the token since name & email
// are embedded in it.
authRouter.patch('/me', requireAuth, async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const userId = req.user!.sub;

  const [current] = await db.select().from(hrUsers).where(eq(hrUsers.id, userId)).limit(1);
  if (!current) throw notFound('Account not found');

  const updates: Partial<typeof hrUsers.$inferInsert> = {};

  if (input.name !== undefined) updates.name = input.name.trim();

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email !== current.email) {
      const [taken] = await db
        .select({ id: hrUsers.id })
        .from(hrUsers)
        .where(and(eq(hrUsers.email, email), ne(hrUsers.id, userId)))
        .limit(1);
      if (taken) throw conflict('That email is already in use');
      updates.email = email;
    }
  }

  if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl; // string or null

  const [updated] = await db
    .update(hrUsers)
    .set(updates)
    .where(eq(hrUsers.id, userId))
    .returning();

  if (!updated) throw notFound('Account not found');

  const token = signToken({
    sub: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
  });

  res.json({ token, user: toPublicUser(updated) });
});

// Change password — verify the current password before setting a new one.
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);
  const userId = req.user!.sub;

  const [user] = await db.select().from(hrUsers).where(eq(hrUsers.id, userId)).limit(1);
  if (!user) throw notFound('Account not found');

  if (!(await verifyPassword(oldPassword, user.passwordHash))) {
    throw badRequest('Current password is incorrect');
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw badRequest('New password must be different from the current one');
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(hrUsers).set({ passwordHash }).where(eq(hrUsers.id, userId));

  res.json({ ok: true });
});
