import jwt from 'jsonwebtoken';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
} from 'livekit-server-sdk';
import { env, liveKitHttpUrl, appPublicUrl, aiRecordingEnabled } from '../config/env.js';
import { db } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { interviewSessions, type InterviewMode } from '../db/schema.js';

/**
 * AI voice interview plumbing: a signed, time-gated candidate join link, plus creating the
 * LiveKit room + interview_sessions row when the candidate actually joins.
 *
 * The join token is a normal JWT (reusing JWT_SECRET) with typ='ai_interview', so it can't
 * be forged and expires after the interview window closes.
 */

const LEAD_MS = () => env.AI_INTERVIEW_LEAD_MINUTES * 60_000;
const GRACE_MS = 5 * 60_000; // allow joining/finishing a few minutes past the end

export interface JoinTokenPayload {
  typ: 'ai_interview';
  interviewId: string;
  candidateId: string;
  candidateName: string;
  scheduledAt: string; // ISO
  durationMinutes: number;
}

export function signJoinToken(p: Omit<JoinTokenPayload, 'typ'>): string {
  const closesAt = new Date(p.scheduledAt).getTime() + p.durationMinutes * 60_000 + GRACE_MS;
  // Token is useless after the window closes.
  const expiresInSec = Math.max(60, Math.ceil((closesAt - Date.now()) / 1000));
  return jwt.sign({ ...p, typ: 'ai_interview' }, env.JWT_SECRET, { expiresIn: expiresInSec });
}

export function verifyJoinToken(token: string): JoinTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as JoinTokenPayload;
  if (payload.typ !== 'ai_interview') throw new Error('Not an AI interview token');
  return payload;
}

/** Candidate-facing join link (a public SPA route that reads ?t=). */
export function buildJoinLink(token: string): string {
  return `${appPublicUrl}/interview?t=${encodeURIComponent(token)}`;
}

export type WindowState = 'too_early' | 'open' | 'expired';

export function windowState(scheduledAt: string, durationMinutes: number, now = Date.now()): WindowState {
  const start = new Date(scheduledAt).getTime();
  if (now < start - LEAD_MS()) return 'too_early';
  if (now > start + durationMinutes * 60_000 + GRACE_MS) return 'expired';
  return 'open';
}

export function isAiVoice(mode: string): mode is Extract<InterviewMode, 'ai_voice'> {
  return mode === 'ai_voice';
}

function roomService(): RoomServiceClient {
  return new RoomServiceClient(liveKitHttpUrl, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
}

/**
 * Start recording the room to S3-compatible storage (best-effort). Returns the egressId, or
 * null if recording isn't configured. The `egress_ended` webhook stores the final path.
 */
async function startRecording(roomName: string): Promise<string | null> {
  if (!aiRecordingEnabled) return null;
  const egress = new EgressClient(liveKitHttpUrl, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `${roomName}-{time}.mp4`,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: env.AI_RECORDING_S3_ACCESS_KEY!,
        secret: env.AI_RECORDING_S3_SECRET_KEY!,
        bucket: env.AI_RECORDING_S3_BUCKET!,
        region: env.AI_RECORDING_S3_REGION,
        endpoint: env.AI_RECORDING_S3_ENDPOINT ?? '',
        forcePathStyle: true,
      }),
    },
  });
  const info = await egress.startRoomCompositeEgress(roomName, { file: output });
  return info.egressId;
}

export interface RoomContext {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string | null;
  jobRequirements: string;
  cvSummary: string;
  questions: string[];
  durationMinutes: number;
}

/**
 * Create (idempotently) the LiveKit room for an interview and an interview_sessions row,
 * then return the candidate's LiveKit access token. The agent worker joins the same room
 * and reads the interview context from room metadata.
 */
export async function createRoomAndSession(
  ctx: RoomContext,
): Promise<{ url: string; token: string; roomName: string }> {
  const roomName = `ai-interview-${ctx.interviewId}`;

  await roomService().createRoom({
    name: roomName,
    metadata: JSON.stringify({
      candidateName: ctx.candidateName,
      jobTitle: ctx.jobTitle,
      jobRequirements: ctx.jobRequirements,
      cvSummary: ctx.cvSummary,
      questions: ctx.questions,
      maxMinutes: ctx.durationMinutes,
    }),
    emptyTimeout: 5 * 60,
    maxParticipants: 3,
  });

  // Start recording (best-effort — never blocks the interview).
  let egressId: string | null = null;
  try {
    egressId = await startRecording(roomName);
  } catch (err) {
    logger.error({ err }, '[ai-interview] startRecording failed (continuing without recording)');
  }

  // One session row per interview; ignore if it already exists (candidate rejoined).
  await db
    .insert(interviewSessions)
    .values({
      interviewId: ctx.interviewId,
      candidateId: ctx.candidateId,
      roomName,
      egressId,
      status: egressId ? 'recording' : 'live',
      startedAt: new Date(),
      consentAt: new Date(),
    })
    .onConflictDoNothing();

  const at = new AccessToken(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!, {
    identity: `candidate-${ctx.candidateId}`,
    name: ctx.candidateName,
    ttl: '30m',
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

  return { url: env.LIVEKIT_URL!, token: await at.toJwt(), roomName };
}
