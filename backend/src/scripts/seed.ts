import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { hrUsers } from '../db/schema.js';
import { hashPassword } from '../lib/auth.js';
import { env } from '../config/env.js';

async function main() {
  const email = env.SEED_HR_EMAIL ?? 'hr@example.com';
  const password = env.SEED_HR_PASSWORD ?? 'ChangeMe123!';
  const name = env.SEED_HR_NAME ?? 'HR Admin';

  const existing = await db.select().from(hrUsers).where(eq(hrUsers.email, email)).limit(1);

  if (existing.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[seed] HR user "${email}" already exists. Skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(hrUsers).values({ email, name, passwordHash, role: 'admin' });

  // eslint-disable-next-line no-console
  console.log(`[seed] Created HR user:\n  email:    ${email}\n  password: ${password}\n  Please change this password after first login.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] Failed:', err);
    process.exit(1);
  });
