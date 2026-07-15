import type {
  QuizAnswer,
  QuizQuestion,
  QuizQuestionResult,
} from '../db/schema.js';
import { gradeShortAnswers, type ShortAnswerItem } from './gemini.js';

// Weight of the CV qualification score vs the quiz score in the combined ranking.
const CV_WEIGHT = 0.6;
const QUIZ_WEIGHT = 0.4;

export type QuizGrade = {
  quizScore: number | null; // 0-100 normalized, null when the job has no quiz
  results: QuizQuestionResult[];
};

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/**
 * Grades a candidate's quiz answers against a job's quiz.
 * Multiple-choice questions are graded locally; short-answer questions are graded
 * by Gemini against their rubric. Returns per-question results and a 0-100 score.
 */
export async function gradeQuiz(
  jobTitle: string,
  quiz: QuizQuestion[],
  answers: QuizAnswer[],
): Promise<QuizGrade> {
  if (!quiz || quiz.length === 0) return { quizScore: null, results: [] };

  const answerById = new Map(answers.map((a) => [a.questionId, a]));
  const totalPoints = quiz.reduce((sum, q) => sum + (q.points || 1), 0) || 1;

  // Grade auto-gradable (choice) questions first.
  const results: QuizQuestionResult[] = [];
  const shortItems: ShortAnswerItem[] = [];

  for (const q of quiz) {
    const answer = answerById.get(q.id);
    const points = q.points || 1;

    if (q.type === 'short') {
      shortItems.push({
        questionId: q.id,
        prompt: q.prompt,
        rubric: q.rubric ?? null,
        answer: answer?.text ?? '',
        maxPoints: points,
      });
      // placeholder, filled after AI grading
      results.push({
        questionId: q.id,
        prompt: q.prompt,
        type: q.type,
        points,
        awarded: 0,
        correct: false,
        feedback: null,
      });
      continue;
    }

    const selected = answer?.selectedOptionIds ?? [];
    const correctIds = q.correctOptionIds ?? [];
    const correct = sameSet(selected, correctIds);
    results.push({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      points,
      awarded: correct ? points : 0,
      correct,
      feedback: null,
    });
  }

  // Grade short-answer questions with Gemini (single batched call).
  if (shortItems.length > 0) {
    const grades = await gradeShortAnswers(jobTitle, shortItems);
    for (const grade of grades) {
      const r = results.find((x) => x.questionId === grade.questionId);
      if (r) {
        r.awarded = grade.awarded;
        r.correct = grade.awarded >= r.points; // "correct" = full marks
        r.feedback = grade.feedback;
      }
    }
  }

  const awarded = results.reduce((sum, r) => sum + r.awarded, 0);
  const quizScore = Math.max(0, Math.min(100, Math.round((awarded / totalPoints) * 100)));

  return { quizScore, results };
}

/**
 * Combines the CV qualification score with the quiz score into a single 0-100
 * ranking value. Falls back to whichever score is available.
 */
export function computeOverallScore(
  qualificationScore: number | null,
  quizScore: number | null,
): number | null {
  if (qualificationScore == null && quizScore == null) return null;
  if (quizScore == null) return qualificationScore;
  if (qualificationScore == null) return quizScore;
  return Math.round(qualificationScore * CV_WEIGHT + quizScore * QUIZ_WEIGHT);
}