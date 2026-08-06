import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/*
 * Supabase's pooled connection works best with prepare disabled.
 *
 * `max` and `idle_timeout` are set deliberately, not for tuning. Supabase's session pooler
 * caps us at 15 clients for the whole project, and postgres.js opens up to 10 per process by
 * default — so the API and the interview worker alone could ask for 20 and lock each other
 * out of the database. Four apiece leaves room for migrations, seeds, and the health check.
 *
 * idle_timeout hands connections back rather than holding them open forever, which is what
 * turns one abandoned dev server into a project-wide outage.
 */
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 4,
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });
export { schema, client };
