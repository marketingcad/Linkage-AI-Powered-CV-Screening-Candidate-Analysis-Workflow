import express, { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { env, liveKitEnabled } from '../config/env.js';
import { db } from '../db/client.js';
import { candidates, interviews, interviewSessions, jobs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { idParams, roomParams, validate } from '../middleware/validate.js';
import { publicReadLimiter, publicSubmitLimiter } from '../middleware/rateLimit.js';
import { logger } from '../lib/logger.js';
import { summarizeInterviewTranscript } from '../services/gemini.js';
import { signStorageObject } from '../services/storage.js';
import type { InterviewTranscriptTurn } from '../db/schema.js';
import {
  buildJoinLink,
  createRoomAndSession,
  signJoinToken,
  verifyJoinToken,
  windowState,
} from '../services/aiInterview.js';

export const aiInterviewRouter = Router();

// --- Request schemas ---------------------------------------------------------------

/** The signed join link token, passed as `?t=`. */
const contextQuery = z.object({ t: z.string().min(1, 'Missing interview link token').max(2048) });

/** Candidate join: the signed token plus explicit recording consent. */
const joinSessionBody = z.object({
  token: z.string().min(1, 'Missing interview link token').max(2048),
  consent: z.literal(true, { message: 'Recording consent is required.' }),
});

/** Agent completion callback — bounded so a runaway worker can't post unlimited data. */
const completeBody = z.object({
  transcript: z
    .array(
      z.object({
        role: z.enum(['agent', 'candidate']),
        text: z.string().max(10_000),
        at: z.number().int().min(0).optional(),
      }),
    )
    .max(500)
    .default([]),
  durationSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
});

// If LiveKit isn't configured, the whole feature is off — fail clearly, don't 404.
aiInterviewRouter.use((_req, res, next) => {
  if (!liveKitEnabled) {
    return res.status(503).json({
      error: { code: 'ai_interview_not_configured', message: 'AI voice interviews are not configured.' },
    });
  }
  next();
});

/**
 * Authed: (re)generate the candidate join link for an existing ai_voice interview.
 * The Scheduler UI calls this after creating/opening an AI interview.
 */
aiInterviewRouter.post('/interviews/:id/link', requireAuth, validate({ params: idParams }), async (req, res) => {
  const interviewId = String(req.params.id);
  const [row] = await db
    .select({
      id: interviews.id,
      candidateId: interviews.candidateId,
      candidateName: candidates.fullName,
      scheduledAt: interviews.scheduledAt,
      durationMinutes: interviews.durationMinutes,
      mode: interviews.mode,
    })
    .from(interviews)
    .leftJoin(candidates, eq(candidates.id, interviews.candidateId))
    .where(eq(interviews.id, interviewId))
    .limit(1);

  if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'Interview not found.' } });
  if (row.mode !== 'ai_voice') {
    return res.status(400).json({ error: { code: 'not_ai_voice', message: 'Interview is not an AI voice interview.' } });
  }

  const token = signJoinToken({
    interviewId: row.id,
    candidateId: row.candidateId,
    candidateName: row.candidateName ?? 'Candidate',
    scheduledAt: row.scheduledAt.toISOString(),
    durationMinutes: row.durationMinutes,
  });
  res.json({ link: buildJoinLink(token), token });
});

/**
 * Public: the candidate page reads this to show the scheduled time and gate the Join button.
 * Returns only non-sensitive display info.
 */
aiInterviewRouter.get('/context', publicReadLimiter, validate({ query: contextQuery }), (req, res) => {
  const { t: token } = req.query as unknown as z.infer<typeof contextQuery>;
  try {
    const p = verifyJoinToken(token);
    res.json({
      candidateName: p.candidateName,
      scheduledAt: p.scheduledAt,
      durationMinutes: p.durationMinutes,
      leadMinutes: env.AI_INTERVIEW_LEAD_MINUTES,
      state: windowState(p.scheduledAt, p.durationMinutes),
    });
  } catch {
    res.status(403).json({ error: { code: 'invalid_link', message: 'This interview link is invalid or expired.' } });
  }
});

/**
 * Public: candidate joins. Verifies the signed link + time window + consent, then creates the
 * LiveKit room and returns a LiveKit access token.
 */
aiInterviewRouter.post('/session', publicSubmitLimiter, validate({ body: joinSessionBody }), async (req, res) => {
  const { token } = req.body as z.infer<typeof joinSessionBody>;

  let p;
  try {
    p = verifyJoinToken(token);
  } catch {
    return res.status(403).json({ error: { code: 'invalid_link', message: 'This interview link is invalid or expired.' } });
  }

  const state = windowState(p.scheduledAt, p.durationMinutes);
  if (state !== 'open') {
    return res.status(403).json({ error: { code: state, message: `Interview link is ${state}.` }, scheduledAt: p.scheduledAt });
  }

  // Pull the real job + CV context for the interviewer persona.
  const [row] = await db
    .select({
      candidateId: interviews.candidateId,
      candidateName: candidates.fullName,
      cvSummary: candidates.summary,
      jobTitle: interviews.title,
      questions: candidates.interviewQuestions,
    })
    .from(interviews)
    .leftJoin(candidates, eq(candidates.id, interviews.candidateId))
    .where(eq(interviews.id, p.interviewId))
    .limit(1);

  if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'Interview not found.' } });

  try {
    const session = await createRoomAndSession({
      interviewId: p.interviewId,
      candidateId: p.candidateId,
      candidateName: p.candidateName,
      jobTitle: row.jobTitle,
      jobRequirements: row.jobTitle ?? 'the role',
      cvSummary: row.cvSummary ?? '',
      questions: (row.questions ?? []).map((q) => (typeof q === 'string' ? q : q.question)).filter(Boolean),
      durationMinutes: p.durationMinutes,
    });
    res.json({ url: session.url, token: session.token });
  } catch (err) {
    logger.error({ err }, 'ai-interview session create failed');
    res.status(500).json({ error: { code: 'session_failed', message: 'Could not start the interview.' } });
  }
});

/**
 * Internal: the agent worker POSTs the finished transcript here (authorized by a shared
 * secret). We store it and generate the AI summary that feeds the review card / scorecard.
 */
aiInterviewRouter.post('/internal/:room/complete', express.json({ limit: '512kb' }), validate({ params: roomParams, body: completeBody }), async (req, res) => {
  if (!env.AGENT_SHARED_SECRET || req.get('x-agent-secret') !== env.AGENT_SHARED_SECRET) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Bad agent secret.' } });
  }
  const roomName = req.params.room;
  const body = req.body as z.infer<typeof completeBody>;
  const transcript: InterviewTranscriptTurn[] = body.transcript;
  const durationSeconds = body.durationSeconds ?? null;

  const [session] = await db
    .select({
      id: interviewSessions.id,
      candidateName: candidates.fullName,
      jobTitle: interviews.title,
      // The role's requirements become the competencies the transcript is rated against.
      roleTitle: jobs.title,
      requiredSkills: jobs.requiredSkills,
    })
    .from(interviewSessions)
    .leftJoin(interviews, eq(interviews.id, interviewSessions.interviewId))
    .leftJoin(candidates, eq(candidates.id, interviewSessions.candidateId))
    .leftJoin(jobs, eq(jobs.id, interviews.jobId))
    .where(eq(interviewSessions.roomName, roomName))
    .limit(1);
  if (!session) return res.status(404).json({ error: { code: 'not_found', message: 'Session not found.' } });

  await db
    .update(interviewSessions)
    .set({ transcript, durationSeconds, endedAt: new Date(), status: 'processing' })
    .where(eq(interviewSessions.roomName, roomName));

  // Summarize (best-effort — a failure still leaves the transcript + recording usable).
  try {
    const summary = await summarizeInterviewTranscript({
      jobTitle: session.jobTitle ?? session.roleTitle,
      candidateName: session.candidateName ?? 'Candidate',
      transcript: transcript.map((t) => ({ role: t.role, text: t.text })),
      competencies: session.requiredSkills ?? undefined,
    });
    await db
      .update(interviewSessions)
      .set({ aiSummary: summary, status: 'ready' })
      .where(eq(interviewSessions.roomName, roomName));
  } catch (err) {
    logger.error({ err }, '[ai-interview] summary generation failed');
    await db.update(interviewSessions).set({ status: 'ready' }).where(eq(interviewSessions.roomName, roomName));
  }

  res.sendStatus(200);
});

/**
 * Authed: HR review — the interview session (status, transcript, AI summary) plus a short-lived
 * signed URL for the recording.
 */
aiInterviewRouter.get('/interviews/:id/session', requireAuth, validate({ params: idParams }), async (req, res) => {
  const interviewId = String(req.params.id);
  const [s] = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.interviewId, interviewId))
    .limit(1);
  if (!s) return res.json({ session: null });

  let recordingUrl: string | null = null;
  if (s.recordingPath && env.AI_RECORDING_S3_BUCKET) {
    recordingUrl = await signStorageObject(env.AI_RECORDING_S3_BUCKET, s.recordingPath);
  }
  res.json({ session: { ...s, recordingUrl } });
});

/**
 * Public: LiveKit webhook. Body arrives as application/webhook+json, which the global
 * express.json() skips, so we read the raw text here to verify the signature.
 */
aiInterviewRouter.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const { WebhookReceiver } = await import('livekit-server-sdk');
    const receiver = new WebhookReceiver(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
    const event = await receiver.receive(req.body.toString(), req.get('Authorization'));

    if (event.event === 'egress_ended') {
      const info = event.egressInfo as unknown as {
        roomName?: string;
        fileResults?: Array<{ location?: string }>;
      };
      const location = info?.fileResults?.[0]?.location;
      if (info?.roomName) {
        await db
          .update(interviewSessions)
          .set({ status: 'ready', recordingPath: location, endedAt: new Date() })
          .where(eq(interviewSessions.roomName, info.roomName));
      }
      logger.info({ room: info?.roomName, location }, '[ai-interview] recording ready');
    }
    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, 'ai-interview webhook verify failed');
    res.sendStatus(401);
  }
});
