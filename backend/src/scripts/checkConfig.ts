import postgres from 'postgres';
import { env, geminiApiKey, corsOrigins } from '../config/env.js';

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

function mask(s: string, keep = 4): string {
  if (!s) return '(empty)';
  if (s.length <= keep * 2) return '****';
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

async function main() {
  console.log('\n=== Environment ===');
  record('NODE_ENV', true, env.NODE_ENV);
  record('PORT', true, String(env.PORT));
  record('CORS_ORIGIN', corsOrigins.length > 0, corsOrigins.join(', '));
  record('JWT_SECRET', env.JWT_SECRET.length >= 16, `${env.JWT_SECRET.length} chars`);
  record('GEMINI_API_KEY', !!geminiApiKey, mask(geminiApiKey));
  record('GEMINI_MODEL', true, env.GEMINI_MODEL);

  console.log('\n=== Database (Supabase Postgres) ===');
  let dbOk = false;
  const sql = postgres(env.DATABASE_URL, { prepare: false, connect_timeout: 15, max: 1 });
  try {
    const [row] = await sql`select version() as version, current_database() as db, now() as now`;
    dbOk = true;
    record('Connection', true, `connected to "${row?.db}"`);
    record('Server', true, String(row?.version).split(',')[0] ?? 'unknown');

    // Check whether our schema has been pushed yet.
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('hr_users', 'jobs', 'candidates')
      order by table_name`;
    const found = tables.map((t) => t.table_name);
    const expected = ['candidates', 'hr_users', 'jobs'];
    const missing = expected.filter((t) => !found.includes(t));
    if (missing.length === 0) {
      record('Schema tables', true, `all present (${found.join(', ')})`);

      // Row counts + any seeded HR user
      const [hr] = await sql`select count(*)::int as n from hr_users`;
      const [jobs] = await sql`select count(*)::int as n from jobs`;
      const [cands] = await sql`select count(*)::int as n from candidates`;
      record('Data', true, `hr_users=${hr?.n}, jobs=${jobs?.n}, candidates=${cands?.n}`);
      if ((hr?.n ?? 0) === 0) {
        console.log('   ℹ️  No HR users yet — run `npm run seed` to create your login.');
      }
    } else {
      record('Schema tables', false, `missing: ${missing.join(', ')} — run \`npm run db:push\``);
    }
  } catch (err) {
    record('Connection', false, err instanceof Error ? err.message : String(err));
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log('\n=== Gemini API (live call) ===');
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: 'Reply with exactly the word: OK',
    });
    const text = (res.text ?? '').trim();
    record('Live request', !!text, text ? `model replied "${text.slice(0, 40)}"` : 'empty reply');
  } catch (err) {
    record('Live request', false, err instanceof Error ? err.message : String(err));
  }

  const allOk = results.every((r) => r.ok);
  console.log(`\n${allOk ? '✅ All configuration checks passed.' : '❌ Some checks failed (see above).'}`);
  if (!dbOk) {
    console.log('   The database connection failed — double-check DATABASE_URL in backend/.env.');
  }
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
