import { Router } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { hrUsers } from '../db/schema.js';
import {
  changePasswordSchema,
  loginSchema,
  mfaLoginSchema,
  totpCodeSchema,
  updateProfileSchema,
} from '../lib/validation.js';
import {
  hashPassword,
  signMfaToken,
  signToken,
  verifyMfaToken,
  verifyPassword,
} from '../lib/auth.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { createTotpSecret, totpAuthUrl, verifyTotp } from '../lib/totp.js';

export const authRouter = Router();

/** Shape returned to the client — never includes the password hash or TOTP secret. */
type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  totpEnabled: boolean;
};

function toPublicUser(u: {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  totpEnabled: boolean;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatarUrl: u.avatarUrl,
    totpEnabled: u.totpEnabled,
  };
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

  // If 2FA is enabled, hold the real token until the authenticator code is verified.
  if (user.totpEnabled) {
    return res.json({ mfaRequired: true, mfaToken: signMfaToken(user.id) });
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  res.json({ token, user: toPublicUser(user) });
});

// Second login step — verify the authenticator code, then issue the real token.
authRouter.post('/login/mfa', async (req, res) => {
  const { mfaToken, code } = mfaLoginSchema.parse(req.body);

  let userId: string;
  try {
    userId = verifyMfaToken(mfaToken);
  } catch {
    throw unauthorized('Your verification session expired — please sign in again.');
  }

  const [user] = await db.select().from(hrUsers).where(eq(hrUsers.id, userId)).limit(1);
  if (!user || !user.totpEnabled || !user.totpSecret) {
    throw unauthorized('Two-factor is not set up for this account.');
  }
  if (!verifyTotp(user.email, user.totpSecret, code)) {
    throw badRequest('Invalid authentication code');
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

// --- Two-factor authentication (TOTP / authenticator app) ---

// Start setup: generate a secret + otpauth URL. Stored but NOT active until confirmed.
authRouter.post('/2fa/setup', requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const [user] = await db.select().from(hrUsers).where(eq(hrUsers.id, userId)).limit(1);
  if (!user) throw notFound('Account not found');
  if (user.totpEnabled) {
    throw conflict('Two-factor is already enabled. Disable it first to re-configure.');
  }

  const secret = createTotpSecret();
  await db.update(hrUsers).set({ totpSecret: secret }).where(eq(hrUsers.id, userId));
  res.json({ secret, otpauthUrl: totpAuthUrl(user.email, secret) });
});

// Confirm setup: verify the first code from the app, then switch it on.
authRouter.post('/2fa/enable', requireAuth, async (req, res) => {
  const { code } = totpCodeSchema.parse(req.body);
  const userId = req.user!.sub;
  const [user] = await db.select().from(hrUsers).where(eq(hrUsers.id, userId)).limit(1);
  if (!user) throw notFound('Account not found');
  if (user.totpEnabled) throw conflict('Two-factor is already enabled.');
  if (!user.totpSecret) throw badRequest('Start two-factor setup first.');
  if (!verifyTotp(user.email, user.totpSecret, code)) {
    throw badRequest('That code is incorrect — check your authenticator app and try again.');
  }

  const [updated] = await db
    .update(hrUsers)
    .set({ totpEnabled: true })
    .where(eq(hrUsers.id, userId))
    .returning();
  if (!updated) throw notFound('Account not found');
  res.json({ ok: true, user: toPublicUser(updated) });
});

// Disable: require a valid current code before turning it off.
authRouter.post('/2fa/disable', requireAuth, async (req, res) => {
  const { code } = totpCodeSchema.parse(req.body);
  const userId = req.user!.sub;
  const [user] = await db.select().from(hrUsers).where(eq(hrUsers.id, userId)).limit(1);
  if (!user) throw notFound('Account not found');

  if (user.totpEnabled && user.totpSecret && !verifyTotp(user.email, user.totpSecret, code)) {
    throw badRequest('Invalid authentication code');
  }

  const [updated] = await db
    .update(hrUsers)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(hrUsers.id, userId))
    .returning();
  if (!updated) throw notFound('Account not found');
  res.json({ ok: true, user: toPublicUser(updated) });
});
