import { GoogleGenAI } from '@google/genai';
import { geminiApiKey } from '../config/env.js';
import { client } from '../db/client.js';
import { logger } from '../lib/logger.js';

const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const MODEL = 'gemini-embedding-001';
const MAX_CHARS = 8000;

/**
 * Embed text into a semantic vector. `kind` sets the retrieval task type so a job
 * ("query") and a CV ("document") land in a comparable space. Never throws — returns
 * null on failure so callers can degrade gracefully.
 */
export async function embedText(text: string, kind: 'document' | 'query'): Promise<number[] | null> {
  const clean = text.trim().slice(0, MAX_CHARS);
  if (!clean) return null;
  const taskType = kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
  try {
    const res = await ai.models.embedContent({ model: MODEL, contents: clean, config: { taskType } });
    const vals = res.embeddings?.[0]?.values;
    if (vals?.length) return vals;
  } catch (err) {
    logger.warn({ err }, 'embedText with taskType failed — retrying without config');
  }
  try {
    const res = await ai.models.embedContent({ model: MODEL, contents: clean });
    return res.embeddings?.[0]?.values ?? null;
  } catch (err) {
    logger.error({ err }, 'embedText failed');
    return null;
  }
}

export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function candidateProfileText(c: {
  currentTitle?: string | null;
  extractedSkills?: string[] | null;
  summary?: string | null;
  cvText?: string | null;
}): string {
  return [
    c.currentTitle ?? '',
    (c.extractedSkills ?? []).join(', '),
    c.summary ?? '',
    c.cvText ?? '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_CHARS);
}

export function jobProfileText(job: {
  title: string;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  educationRequirement?: string | null;
}): string {
  return [
    job.title,
    job.description,
    `Required skills: ${job.requiredSkills.join(', ')}`,
    `Nice to have: ${job.niceToHaveSkills.join(', ')}`,
    job.educationRequirement ?? '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_CHARS);
}

/** Persist a candidate's embedding (stored as jsonb, outside the Drizzle schema). */
export async function storeEmbedding(candidateId: string, vec: number[]): Promise<void> {
  await client`UPDATE candidates SET embedding = ${JSON.stringify(vec)}::jsonb WHERE id = ${candidateId}`;
}
