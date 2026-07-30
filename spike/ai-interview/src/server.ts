import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';
import { config } from './config.js';
import { startRecording } from './egress.js';
import { SAMPLE_CONTEXT, type InterviewContext } from './prompt.js';
import { signScheduleToken, verifyScheduleToken, windowError } from './token.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_FILE = join(__dirname, '..', 'sessions.json');

// --- tiny file-backed session store (production uses the interview_sessions table) ---
type Session = {
  room: string;
  candidateName: string;
  createdAt: string;
  egressId: string | null;
  recordingUrl?: string;
  status: 'live' | 'recording' | 'ready' | 'no-recording';
};

function loadSessions(): Session[] {
  if (!existsSync(SESSIONS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, 'utf8')) as Session[];
  } catch {
    return [];
  }
}
function saveSessions(list: Session[]): void {
  writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2));
}
function upsert(session: Session): void {
  const list = loadSessions();
  const i = list.findIndex((s) => s.room === session.room);
  if (i >= 0) list[i] = { ...list[i], ...session };
  else list.unshift(session);
  saveSessions(list);
}

const roomService = new RoomServiceClient(
  config.livekitHttpUrl,
  config.livekitApiKey,
  config.livekitApiSecret,
);
const webhooks = new WebhookReceiver(config.livekitApiKey, config.livekitApiSecret);

const app = express();

/**
 * HR schedules an interview → returns a signed, time-gated join link.
 * (Prototype stand-in for your real Scheduler + interviews table + invite email.)
 */
app.post('/api/schedule', express.json(), (req, res) => {
  const candidateName = String(req.body?.candidateName ?? 'Candidate').slice(0, 80);
  const durationMinutes = Math.min(60, Math.max(5, Number(req.body?.durationMinutes ?? 15)));
  const at = new Date(String(req.body?.scheduledAt ?? ''));
  if (Number.isNaN(at.getTime())) {
    return res.status(400).json({ error: 'invalid scheduledAt' });
  }
  const scheduledAt = at.toISOString();
  const token = signScheduleToken({ candidateName, scheduledAt, durationMinutes });
  res.json({
    token,
    link: `/?t=${encodeURIComponent(token)}`,
    scheduledAt,
    durationMinutes,
    opensMinutesBefore: config.scheduleLeadMinutes,
  });
});

/**
 * Create an interview room and return a candidate join token.
 * If a schedule `token` is supplied it must be valid AND inside the join window.
 * With no token, instant-join is allowed (dev/demo convenience).
 * The interview context is attached as room metadata so the agent worker can read it.
 */
app.post('/api/session', express.json(), async (req, res) => {
  try {
    let candidateName = String(req.body?.candidateName ?? 'Candidate').slice(0, 80);

    const rawToken = req.body?.token ? String(req.body.token) : null;
    if (rawToken) {
      const v = verifyScheduleToken(rawToken);
      if (!v.valid) {
        return res.status(403).json({ error: 'invalid_link', reason: v.reason });
      }
      const werr = windowError(v.payload, Date.now());
      if (werr) {
        return res.status(403).json({ error: werr, scheduledAt: v.payload.scheduledAt });
      }
      candidateName = v.payload.candidateName; // trust the signed name, not the client
    }

    const room = `interview-${randomUUID().slice(0, 8)}`;

    const context: InterviewContext = { ...SAMPLE_CONTEXT, candidateName };
    await roomService.createRoom({
      name: room,
      metadata: JSON.stringify(context),
      emptyTimeout: 5 * 60, // auto-close 5 min after everyone leaves
      maxParticipants: 3, // candidate + AI agent (+1 headroom)
    });

    // Best-effort recording — waits for publishers, so starting now is fine.
    let egressId: string | null = null;
    try {
      egressId = await startRecording(room);
    } catch (err) {
      console.error('[server] startRecording failed (continuing without recording):', err);
    }

    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: `candidate-${randomUUID().slice(0, 6)}`,
      name: candidateName,
      ttl: '30m',
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    upsert({
      room,
      candidateName,
      createdAt: new Date().toISOString(),
      egressId,
      status: egressId ? 'recording' : 'no-recording',
    });

    res.json({ url: config.livekitUrl, token, room });
  } catch (err) {
    console.error('[server] /api/session error:', err);
    res.status(500).json({ error: 'failed to create session' });
  }
});

/**
 * LiveKit webhook receiver. The body must be the raw request text so the signature verifies.
 * We care about `egress_ended` to capture where the recording landed.
 */
app.post('/api/livekit/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const event = await webhooks.receive(req.body.toString(), req.get('Authorization'));
    if (event.event === 'egress_ended') {
      const info = event.egressInfo;
      // Field name moved between SDK versions (file → fileResults); read defensively.
      const anyInfo = info as unknown as {
        egressId?: string;
        fileResults?: Array<{ location?: string }>;
        file?: { location?: string };
      };
      const location = anyInfo?.fileResults?.[0]?.location ?? anyInfo?.file?.location ?? undefined;
      const list = loadSessions();
      const s = list.find((x) => x.egressId === anyInfo?.egressId);
      if (s) {
        s.status = 'ready';
        s.recordingUrl = location;
        saveSessions(list);
      }
      console.log('[server] egress_ended:', info?.egressId, '→', location);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[server] webhook verify failed:', err);
    res.sendStatus(401);
  }
});

app.get('/api/sessions', (_req, res) => {
  res.json({ sessions: loadSessions() });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
  console.log(`[server] control plane on http://localhost:${config.port}`);
  console.log(`[server] recording: ${config.s3 ? 'enabled' : 'disabled (set S3_* to enable)'}`);
});
