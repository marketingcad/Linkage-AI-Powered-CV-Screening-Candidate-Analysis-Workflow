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
  await client`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS timezone varchar(64)`;

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

  // AI voice interview sessions — one row per interviews.mode = 'ai_voice' call.
  await client`
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      room_name varchar(128),
      provider varchar(32) NOT NULL DEFAULT 'livekit',
      egress_id varchar(128),
      status varchar(24) NOT NULL DEFAULT 'pending',
      recording_path text,
      transcript jsonb,
      ai_summary jsonb,
      consent_at timestamptz,
      started_at timestamptz,
      ended_at timestamptz,
      duration_seconds integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`DROP INDEX IF EXISTS interview_sessions_interview_id_idx`; // superseded by the unique index
  await client`CREATE UNIQUE INDEX IF NOT EXISTS interview_sessions_interview_id_key ON interview_sessions (interview_id)`;
  await client`CREATE INDEX IF NOT EXISTS interview_sessions_candidate_id_idx ON interview_sessions (candidate_id)`;

  // --- Offer stage + measurable pipeline ------------------------------------
  // 'offer' sits before 'hired' so ordering by stage still reads as the funnel order.
  // ALTER TYPE ... ADD VALUE cannot run inside a transaction, hence its own statement.
  await client`ALTER TYPE candidate_stage ADD VALUE IF NOT EXISTS 'offer' BEFORE 'hired'`;

  await client`
    CREATE TABLE IF NOT EXISTS candidate_stage_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      from_stage varchar(20),
      to_stage varchar(20) NOT NULL,
      reason varchar(200),
      changed_by uuid REFERENCES hr_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS candidate_stage_events_candidate_idx ON candidate_stage_events (candidate_id, created_at)`;
  await client`CREATE INDEX IF NOT EXISTS candidate_stage_events_to_stage_idx ON candidate_stage_events (to_stage)`;

  await client`
    CREATE TABLE IF NOT EXISTS offers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
      status varchar(20) NOT NULL DEFAULT 'draft',
      salary_amount integer,
      salary_currency varchar(3),
      start_date timestamptz,
      expires_at timestamptz,
      notes text,
      decline_reason varchar(200),
      created_by uuid REFERENCES hr_users(id) ON DELETE SET NULL,
      extended_at timestamptz,
      responded_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS offers_candidate_idx ON offers (candidate_id)`;

  // Backfill: give every existing candidate an initial 'new' event at their application time,
  // so they appear in funnel/velocity metrics instead of looking like they never entered the
  // pipeline. Anyone already past 'new' also gets a synthetic move at their last update, which
  // is the closest timestamp we have — approximate, but better than excluding them entirely.
  await client`
    INSERT INTO candidate_stage_events (candidate_id, from_stage, to_stage, created_at)
    SELECT c.id, NULL, 'new', c.created_at
    FROM candidates c
    WHERE NOT EXISTS (SELECT 1 FROM candidate_stage_events e WHERE e.candidate_id = c.id)
  `;
  await client`
    INSERT INTO candidate_stage_events (candidate_id, from_stage, to_stage, created_at)
    SELECT c.id, 'new', c.stage::text, GREATEST(c.updated_at, c.created_at)
    FROM candidates c
    WHERE c.stage <> 'new'
      AND NOT EXISTS (
        SELECT 1 FROM candidate_stage_events e
        WHERE e.candidate_id = c.id AND e.to_stage = c.stage::text
      )
  `;

  // Advisory focus-loss counters for AI interviews.
  await client`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS tab_away_count integer NOT NULL DEFAULT 0`;
  await client`ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS tab_away_seconds integer NOT NULL DEFAULT 0`;

  // How a role is worked, kept separate from where it is. Existing jobs whose free-text
  // location already said "Remote" are seeded from it so they aren't left blank; the city text
  // is deliberately left alone rather than parsed apart.
  await client`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_arrangement varchar(40)`;
  await client`
    UPDATE jobs SET work_arrangement = 'Remote'
    WHERE work_arrangement IS NULL AND location ILIKE '%remote%'`;
  await client`
    UPDATE jobs SET work_arrangement = 'Hybrid'
    WHERE work_arrangement IS NULL AND location ILIKE '%hybrid%'`;
  // A location that was *only* the arrangement word carries no place information, and leaving
  // it would render "Remote · Remote" on the posting. Locations naming an actual place are
  // untouched, so "Remote — Austin, TX" keeps its city.
  await client`
    UPDATE jobs SET location = NULL
    WHERE work_arrangement IS NOT NULL
      AND lower(btrim(location)) = lower(work_arrangement)`;

  // Retiring a role without destroying its applicants.
  await client`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at timestamptz`;

  /*
   * candidates.job_id was ON DELETE CASCADE, so deleting a job erased every applicant to it —
   * their CVs, scores, interviews, and the stage events every pipeline metric is computed
   * from. RESTRICT makes the database itself refuse, rather than relying on a UI confirmation
   * that a script or a future endpoint could bypass. Archive the job instead; hard delete
   * stays available once no candidate references it.
   *
   * interviews and offers already used SET NULL and are unaffected.
   */
  await client`ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_job_id_jobs_id_fk`;
  await client`
    ALTER TABLE candidates
    ADD CONSTRAINT candidates_job_id_jobs_id_fk
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT`;

  // Archived jobs are filtered out of the working lists on every page load.
  await client`CREATE INDEX IF NOT EXISTS jobs_archived_at_idx ON jobs (archived_at)`;

  // When the role was approved to hire for — the start of the time-to-fill clock.
  await client`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS requisition_approved_at timestamptz`;
  // Backfill from created_at for roles that are already open or closed. In this app a job row
  // is created when the role is approved, so created_at is the honest proxy — and without it
  // time-to-fill would read "no data" for every role that already exists. Draft jobs are left
  // null: they have not been approved yet, and they get their timestamp when opened.
  await client`
    UPDATE jobs SET requisition_approved_at = created_at
    WHERE requisition_approved_at IS NULL AND status <> 'draft'`;

  // Team roles: collapse the old free-form role column onto 'admin' | 'member'.
  await client`ALTER TABLE hr_users ALTER COLUMN role SET DEFAULT 'member'`;
  await client`UPDATE hr_users SET role = 'member' WHERE role IS NULL OR role <> 'admin'`;

  // eslint-disable-next-line no-console
  console.log('[migrate] scoring columns + interviews + candidate_notes + interview_sessions + roles ensured');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] Failed:', err);
    process.exit(1);
  });
