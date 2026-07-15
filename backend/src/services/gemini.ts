import { randomUUID } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { env, geminiApiKey } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { serverError } from '../lib/errors.js';
import type {
  ExtractedEducation,
  ExtractedExperience,
  Job,
  QuizQuestion,
  SkillMatch,
} from '../db/schema.js';

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

export type AnalysisResult = {
  extraction: {
    skills: string[];
    experience: ExtractedExperience[];
    education: ExtractedEducation[];
    certifications: string[];
    totalYearsExperience: number;
  };
  evaluation: {
    qualificationScore: number;
    skillsMatchScore: number;
    skillMatches: SkillMatch[];
    strengths: string[];
    concerns: string[];
    summary: string;
    recommendation: 'strong_match' | 'possible' | 'not_a_fit';
  };
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    extraction: {
      type: Type.OBJECT,
      properties: {
        skills: {
          type: Type.ARRAY,
          description: 'All technical and soft skills found in the CV.',
          items: { type: Type.STRING },
        },
        experience: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              company: { type: Type.STRING },
              title: { type: Type.STRING },
              startDate: { type: Type.STRING, nullable: true },
              endDate: { type: Type.STRING, nullable: true, description: 'null or "Present" if current' },
              summary: { type: Type.STRING, nullable: true },
            },
            required: ['company', 'title'],
          },
        },
        education: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              institution: { type: Type.STRING },
              degree: { type: Type.STRING, nullable: true },
              field: { type: Type.STRING, nullable: true },
              year: { type: Type.STRING, nullable: true },
            },
            required: ['institution'],
          },
        },
        certifications: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        totalYearsExperience: {
          type: Type.INTEGER,
          description: 'Best estimate of total years of professional experience.',
        },
      },
      required: ['skills', 'experience', 'education', 'certifications', 'totalYearsExperience'],
    },
    evaluation: {
      type: Type.OBJECT,
      properties: {
        qualificationScore: {
          type: Type.INTEGER,
          description: 'Overall fit for the role from 0 (poor) to 100 (excellent).',
        },
        skillsMatchScore: {
          type: Type.INTEGER,
          description: 'How well the candidate skills match the required skills, 0 to 100.',
        },
        skillMatches: {
          type: Type.ARRAY,
          description: 'One entry per required/nice-to-have skill indicating whether it was found.',
          items: {
            type: Type.OBJECT,
            properties: {
              skill: { type: Type.STRING },
              matched: { type: Type.BOOLEAN },
              evidence: { type: Type.STRING, nullable: true },
            },
            required: ['skill', 'matched'],
          },
        },
        strengths: {
          type: Type.ARRAY,
          description: '3-5 concrete strengths relative to this role.',
          items: { type: Type.STRING },
        },
        concerns: {
          type: Type.ARRAY,
          description: 'Gaps, risks, or missing requirements relative to this role.',
          items: { type: Type.STRING },
        },
        summary: {
          type: Type.STRING,
          description: 'A concise 2-3 sentence recruiter-facing summary of this candidate.',
        },
        recommendation: {
          type: Type.STRING,
          enum: ['strong_match', 'possible', 'not_a_fit'],
        },
      },
      required: [
        'qualificationScore',
        'skillsMatchScore',
        'skillMatches',
        'strengths',
        'concerns',
        'summary',
        'recommendation',
      ],
    },
  },
  required: ['extraction', 'evaluation'],
};

function buildPrompt(job: Job, cvText: string): string {
  const req = [
    `Title: ${job.title}`,
    job.department ? `Department: ${job.department}` : null,
    job.location ? `Location: ${job.location}` : null,
    job.employmentType ? `Employment type: ${job.employmentType}` : null,
    job.minYearsExperience != null
      ? `Minimum years of experience: ${job.minYearsExperience}`
      : null,
    job.educationRequirement ? `Education requirement: ${job.educationRequirement}` : null,
    `Required skills: ${job.requiredSkills.length ? job.requiredSkills.join(', ') : 'none specified'}`,
    `Nice-to-have skills: ${job.niceToHaveSkills.length ? job.niceToHaveSkills.join(', ') : 'none specified'}`,
    '',
    'Job description:',
    job.description,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    'You are an expert technical recruiter screening a CV against a specific job opening.',
    'First extract the candidate\'s information from the CV, then objectively evaluate their fit.',
    'Base every judgement strictly on evidence in the CV. Do not invent experience.',
    'In skillMatches, include an entry for each required skill and each nice-to-have skill.',
    '',
    '=== JOB OPENING ===',
    req,
    '',
    '=== CANDIDATE CV (raw extracted text) ===',
    cvText.slice(0, 30000),
  ].join('\n');
}

export async function analyzeCandidate(job: Job, cvText: string): Promise<AnalysisResult> {
  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: buildPrompt(job, cvText),
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    const parsed = JSON.parse(text) as AnalysisResult;
    return clampScores(parsed);
  } catch (err) {
    logger.error({ err }, 'Gemini analysis failed');
    throw serverError('AI analysis failed', err instanceof Error ? err.message : String(err));
  }
}

function clampScores(result: AnalysisResult): AnalysisResult {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  result.evaluation.qualificationScore = clamp(result.evaluation.qualificationScore);
  result.evaluation.skillsMatchScore = clamp(result.evaluation.skillsMatchScore);
  return result;
}

// ---------------------------------------------------------------------------
// Short-answer (open-ended) quiz grading
// ---------------------------------------------------------------------------

export type ShortAnswerItem = {
  questionId: string;
  prompt: string;
  rubric?: string | null;
  answer: string;
  maxPoints: number;
};

export type ShortAnswerGrade = {
  questionId: string;
  awarded: number;
  feedback: string;
};

const shortAnswerSchema = {
  type: Type.OBJECT,
  properties: {
    grades: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionId: { type: Type.STRING },
          awarded: { type: Type.NUMBER, description: 'Points awarded, between 0 and maxPoints.' },
          feedback: { type: Type.STRING, description: 'One short sentence justifying the score.' },
        },
        required: ['questionId', 'awarded', 'feedback'],
      },
    },
  },
  required: ['grades'],
};

/**
 * Grades open-ended quiz answers against each question's rubric using Gemini.
 * Returns a grade per item; on failure, awards 0 with an explanatory note so the
 * application flow never breaks.
 */
export async function gradeShortAnswers(
  jobTitle: string,
  items: ShortAnswerItem[],
): Promise<ShortAnswerGrade[]> {
  if (items.length === 0) return [];

  const prompt = [
    `You are grading a candidate's short-answer exam for the role "${jobTitle}".`,
    'For each question, award points from 0 to its maxPoints based on correctness,',
    'relevance, and the rubric (if provided). Be fair but rigorous.',
    '',
    'Questions and answers (JSON):',
    JSON.stringify(
      items.map((i) => ({
        questionId: i.questionId,
        question: i.prompt,
        rubric: i.rubric ?? 'No rubric — judge correctness and relevance to the role.',
        maxPoints: i.maxPoints,
        candidateAnswer: i.answer || '(no answer provided)',
      })),
    ),
  ].join('\n');

  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: shortAnswerSchema, temperature: 0.1 },
    });
    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');
    const parsed = JSON.parse(text) as { grades: ShortAnswerGrade[] };

    return items.map((item) => {
      const g = parsed.grades.find((x) => x.questionId === item.questionId);
      const awarded = Math.max(0, Math.min(item.maxPoints, Math.round(g?.awarded ?? 0)));
      return { questionId: item.questionId, awarded, feedback: g?.feedback ?? 'Not graded.' };
    });
  } catch (err) {
    logger.error({ err }, 'Short-answer grading failed');
    return items.map((item) => ({
      questionId: item.questionId,
      awarded: 0,
      feedback: 'Automatic grading failed — please review manually.',
    }));
  }
}

// ---------------------------------------------------------------------------
// AI quiz generation (from a job description)
// ---------------------------------------------------------------------------

export type QuizGenInput = {
  title: string;
  description: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  minYearsExperience?: number | null;
  educationRequirement?: string | null;
};

export type QuizGenOptions = {
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
};

const generateQuizSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['single', 'multiple', 'short'] },
          prompt: { type: Type.STRING },
          points: { type: Type.INTEGER, description: '1-2 for choice, 3-5 for short answer.' },
          options: {
            type: Type.ARRAY,
            description: 'Only for single/multiple. 3-4 options. Omit for short answer.',
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                correct: { type: Type.BOOLEAN },
              },
              required: ['text', 'correct'],
            },
          },
          rubric: {
            type: Type.STRING,
            description: 'Only for short answer — how to award full marks.',
          },
        },
        required: ['type', 'prompt', 'points'],
      },
    },
  },
  required: ['questions'],
};

type RawGenQuestion = {
  type: 'single' | 'multiple' | 'short';
  prompt: string;
  points: number;
  options?: { text: string; correct: boolean }[];
  rubric?: string;
};

/**
 * Generates a position-specific screening quiz using Gemini and returns it as
 * fully-formed, editable QuizQuestion objects (with stable ids and derived
 * correct-answer sets). Invalid questions from the model are dropped defensively.
 */
export async function generateQuiz(
  job: QuizGenInput,
  opts: QuizGenOptions = {},
): Promise<QuizQuestion[]> {
  const count = Math.max(1, Math.min(15, opts.count ?? 5));
  const difficulty = opts.difficulty ?? 'medium';

  const jobInfo = [
    `Title: ${job.title}`,
    job.minYearsExperience != null ? `Minimum experience: ${job.minYearsExperience} years` : null,
    job.educationRequirement ? `Education: ${job.educationRequirement}` : null,
    `Required skills: ${job.requiredSkills?.length ? job.requiredSkills.join(', ') : 'n/a'}`,
    `Nice-to-have: ${job.niceToHaveSkills?.length ? job.niceToHaveSkills.join(', ') : 'n/a'}`,
    '',
    'Description:',
    job.description,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [
    `Create a ${difficulty}-difficulty screening exam of ${count} questions for the role below.`,
    'Test the specific skills and knowledge the role needs — not generic trivia.',
    'Use a mix of single-choice, multiple-choice, and 1-2 short-answer questions.',
    'For choice questions provide 3-4 plausible options and mark the correct one(s):',
    'single = exactly one correct; multiple = one or more correct.',
    'For short-answer questions include a concise grading rubric.',
    'Keep prompts clear and unambiguous.',
    '',
    '=== ROLE ===',
    jobInfo,
  ].join('\n');

  let raw: RawGenQuestion[];
  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: generateQuizSchema, temperature: 0.6 },
    });
    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');
    raw = (JSON.parse(text) as { questions: RawGenQuestion[] }).questions ?? [];
  } catch (err) {
    logger.error({ err }, 'Quiz generation failed');
    throw serverError('AI quiz generation failed', err instanceof Error ? err.message : String(err));
  }

  return raw.map(normalizeGenerated).filter((q): q is QuizQuestion => q !== null);
}

function normalizeGenerated(q: RawGenQuestion): QuizQuestion | null {
  const points = Math.max(1, Math.min(100, Math.round(q.points || (q.type === 'short' ? 4 : 1))));
  const prompt = (q.prompt ?? '').trim();
  if (!prompt) return null;

  if (q.type === 'short') {
    return { id: randomUUID().slice(0, 8), type: 'short', prompt, points, rubric: q.rubric?.trim() || null };
  }

  const rawOptions = (q.options ?? []).filter((o) => o.text?.trim());
  if (rawOptions.length < 2) return null;

  const options = rawOptions.map((o) => ({ id: randomUUID().slice(0, 8), text: o.text.trim() }));
  let correctOptionIds = options.filter((_, i) => rawOptions[i]!.correct).map((o) => o.id);

  // Defensive: ensure at least one correct, and exactly one for single-choice.
  if (correctOptionIds.length === 0) correctOptionIds = [options[0]!.id];
  if (q.type === 'single') correctOptionIds = [correctOptionIds[0]!];

  return { id: randomUUID().slice(0, 8), type: q.type, prompt, points, options, correctOptionIds };
}
