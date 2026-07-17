import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, DEFAULT_SCORING_WEIGHTS, type Job, type ScoringWeights } from '../db/schema.js';

export { DEFAULT_SCORING_WEIGHTS };

/** The four 0-100 component scores that feed the overall ranking. */
export type ScoreComponents = {
  skills: number | null;
  experience: number | null;
  education: number | null;
  quiz: number | null;
};

/** Coerce arbitrary input into valid non-negative weights, falling back to defaults. */
export function normalizeWeights(w: Partial<ScoringWeights> | null | undefined): ScoringWeights {
  const clamp = (n: unknown, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(100, Math.round(n)) : fallback;
  return {
    skills: clamp(w?.skills, DEFAULT_SCORING_WEIGHTS.skills),
    experience: clamp(w?.experience, DEFAULT_SCORING_WEIGHTS.experience),
    education: clamp(w?.education, DEFAULT_SCORING_WEIGHTS.education),
    quiz: clamp(w?.quiz, DEFAULT_SCORING_WEIGHTS.quiz),
  };
}

/**
 * Blends the available component scores into a single 0-100 overall score using the
 * job's weights. Components that are null (e.g. no quiz, or a legacy row missing a
 * sub-score) are dropped and the remaining weights are renormalized — so a role with
 * no exam still ranks purely on skills/experience/education. Returns null when no
 * component is available at all.
 */
export function computeWeightedScore(
  components: ScoreComponents,
  weights: ScoringWeights,
): number | null {
  const w = normalizeWeights(weights);
  const parts: { weight: number; value: number }[] = [];
  const add = (weight: number, value: number | null) => {
    if (value != null && weight > 0) parts.push({ weight, value });
  };
  add(w.skills, components.skills);
  add(w.experience, components.experience);
  add(w.education, components.education);
  add(w.quiz, components.quiz);

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight <= 0) return null;

  const weighted = parts.reduce((sum, p) => sum + p.weight * p.value, 0);
  return Math.max(0, Math.min(100, Math.round(weighted / totalWeight)));
}

/**
 * Recompute overall scores for every analyzed candidate of a job from their already-
 * stored component scores — no AI calls. Used after a job's weights change so the
 * ranking updates instantly. Returns how many rows were updated.
 */
export async function recomputeJobScores(job: Job): Promise<number> {
  const rows = await db
    .select({
      id: candidates.id,
      skills: candidates.skillsMatchScore,
      experience: candidates.experienceScore,
      education: candidates.educationScore,
      quiz: candidates.quizScore,
    })
    .from(candidates)
    .where(eq(candidates.jobId, job.id));

  const weights = job.scoringWeights ?? DEFAULT_SCORING_WEIGHTS;
  let updated = 0;
  for (const r of rows) {
    const overallScore = computeWeightedScore(
      { skills: r.skills, experience: r.experience, education: r.education, quiz: r.quiz },
      weights,
    );
    await db
      .update(candidates)
      .set({ overallScore, updatedAt: new Date() })
      .where(eq(candidates.id, r.id));
    updated += 1;
  }
  return updated;
}
