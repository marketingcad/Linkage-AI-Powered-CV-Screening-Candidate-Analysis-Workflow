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

  // eslint-disable-next-line no-console
  console.log('[migrate] scoring columns ensured (jobs.scoring_weights, candidates.experience_score, candidates.education_score, candidates.score_explanations, candidates.interview_questions)');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] Failed:', err);
    process.exit(1);
  });
