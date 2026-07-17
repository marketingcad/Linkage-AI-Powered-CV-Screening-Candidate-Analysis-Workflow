import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidates, type Job, type QuizAnswer } from '../db/schema.js';
import { analyzeCandidate } from './gemini.js';
import { gradeQuiz } from './quiz.js';
import { computeWeightedScore, DEFAULT_SCORING_WEIGHTS } from './scoring.js';
import { candidateProfileText, embedText, storeEmbedding } from './embedding.js';
import { logger } from '../lib/logger.js';

/**
 * Runs the AI analysis for a candidate against a job and persists the results.
 * Analyzes the CV, grades the quiz (if any), and computes a combined score.
 * Sets analysisStatus to completed/failed accordingly. Never throws — errors are
 * recorded on the candidate row so the workflow keeps moving.
 */
export async function runAnalysis(
  candidateId: string,
  job: Job,
  cvText: string,
  quizAnswers: QuizAnswer[] = [],
): Promise<void> {
  await db
    .update(candidates)
    .set({ analysisStatus: 'processing', updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));

  try {
    const [{ extraction, evaluation, aiDetection }, quizGrade] = await Promise.all([
      analyzeCandidate(job, cvText),
      gradeQuiz(job.title, job.quiz ?? [], quizAnswers),
    ]);

    const overallScore = computeWeightedScore(
      {
        skills: evaluation.skillsMatchScore,
        experience: evaluation.experienceScore,
        education: evaluation.educationScore,
        quiz: quizGrade.quizScore,
      },
      job.scoringWeights ?? DEFAULT_SCORING_WEIGHTS,
    );

    await db
      .update(candidates)
      .set({
        extractedSkills: extraction.skills,
        extractedExperience: extraction.experience,
        extractedEducation: extraction.education,
        extractedCertifications: extraction.certifications,
        totalYearsExperience: extraction.totalYearsExperience,
        qualificationScore: evaluation.qualificationScore,
        skillsMatchScore: evaluation.skillsMatchScore,
        experienceScore: evaluation.experienceScore,
        educationScore: evaluation.educationScore,
        skillMatches: evaluation.skillMatches,
        scoreExplanations: evaluation.scoreExplanations,
        strengths: evaluation.strengths,
        concerns: evaluation.concerns,
        summary: evaluation.summary,
        recommendation: evaluation.recommendation,
        aiLikelihood: aiDetection?.aiGeneratedLikelihood ?? null,
        aiVerdict: aiDetection?.verdict ?? null,
        aiSignals: aiDetection?.signals ?? null,
        quizScore: quizGrade.quizScore,
        quizResults: quizGrade.results,
        overallScore,
        analysisStatus: 'completed',
        analysisError: null,
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateId));

    // Semantic embedding for talent-pool matching (non-fatal — never fails analysis).
    try {
      const vec = await embedText(
        candidateProfileText({
          extractedSkills: extraction.skills,
          summary: evaluation.summary,
          cvText,
        }),
        'document',
      );
      if (vec) await storeEmbedding(candidateId, vec);
    } catch (err) {
      logger.warn({ err, candidateId }, 'candidate embedding failed');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, candidateId }, 'Analysis failed');
    await db
      .update(candidates)
      .set({ analysisStatus: 'failed', analysisError: message, updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
  }
}