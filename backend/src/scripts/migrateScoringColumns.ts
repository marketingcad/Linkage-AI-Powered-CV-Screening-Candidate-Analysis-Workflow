import { client } from '../db/client.js';

/**
 * Idempotent migration for the configurable scoring-weights + explainable-scoring
 * features. Adds jobs.scoring_weights, candidates.experience_score /
 * education_score, and candidates.score_explanations.
 *
 * Applied via raw SQL (not `drizzle-kit push`) on purpose: the live DB has a
 * `candidates.embedding` column that lives outside the Drizzle schema (managed by
 * the talent-pool feature), and `push` would try to drop it.
 */
async function main() {
  await client`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS scoring_weights jsonb NOT NULL
    DEFAULT '{"skills":40,"experience":30,"education":15,"quiz":15}'::jsonb
  `;
  await client`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience_score integer`;
  await client`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education_score integer`;
  await client`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS score_explanations jsonb`;
  await client`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_questions jsonb`;
  await client`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS availability_slots jsonb`;

  // Scheduler: interviews pinned to the calendar (with reminders).
  await client`
    CREATE TABLE IF NOT EXISTS interviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
      created_by uuid REFERENCES hr_users(id) ON DELETE SET NULL,
      title varchar(255),
      scheduled_at timestamptz NOT NULL,
      duration_minutes integer NOT NULL DEFAULT 45,
      mode varchar(20) NOT NULL DEFAULT 'video',
      location text,
      notes text,
      reminder_minutes integer NOT NULL DEFAULT 30,
      reminder_sent boolean NOT NULL DEFAULT false,
      status varchar(20) NOT NULL DEFAULT 'scheduled',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS interviews_scheduled_at_idx ON interviews (scheduled_at)`;
  await client`CREATE INDEX IF NOT EXISTS interviews_candidate_id_idx ON interviews (candidate_id)`;

  // Candidate notes & human scorecards.
  await client`
    CREATE TABLE IF NOT EXISTS candidate_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      author_id uuid REFERENCES hr_users(id) ON DELETE SET NULL,
      author_name varchar(255),
      rating integer,
      body text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS candidate_notes_candidate_id_idx ON candidate_notes (candidate_id)`;

  // eslint-disable-next-line no-console
  console.log('[migrate] scoring columns + interviews + candidate_notes tables ensured');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] Failed:', err);
    process.exit(1);
  });
