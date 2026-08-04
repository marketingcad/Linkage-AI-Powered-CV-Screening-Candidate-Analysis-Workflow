import 'dotenv/config'; // load .env before the LiveKit CLI / env checks run
import { fileURLToPath } from 'node:url';
import {
  type JobContext,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { buildInterviewerInstructions, parseContext } from './prompt.js';

/**
 * AI voice interviewer worker.
 *
 * LiveKit dispatches this into `ai-interview-*` rooms created by the backend. It reads the
 * interview context from room metadata, runs a Gemini Live voice session, captures the
 * transcript, and POSTs it back to the backend when the candidate leaves.
 *
 * Deploy as a long-running "background worker" (see README/Dockerfile). Run: `npm start`.
 *
 * NOTE: realtime plugin export paths, the model id, and session transcript events move
 * between @livekit/agents releases — verify these against the version you install.
 */

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const AGENT_SECRET = process.env.AGENT_SHARED_SECRET ?? '';

type Turn = { role: 'agent' | 'candidate'; text: string; at: number };

async function reportCompletion(roomName: string, transcript: Turn[], startedAt: number) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ai-interview/internal/${encodeURIComponent(roomName)}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-secret': AGENT_SECRET },
      body: JSON.stringify({
        transcript,
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      }),
    });
    if (!res.ok) console.error(`[agent] completion callback failed: ${res.status}`);
  } catch (err) {
    console.error('[agent] completion callback error:', err);
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    if (!process.env.GOOGLE_API_KEY) throw new Error('[agent] GOOGLE_API_KEY is required');

    await ctx.connect();
    const roomName = ctx.room.name ?? 'unknown';
    const interview = parseContext(ctx.room.metadata);
    const instructions = buildInterviewerInstructions(interview);
    const startedAt = Date.now();
    const transcript: Turn[] = [];

    const agent = new voice.Agent({ instructions });
    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        model: process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025',
        apiKey: process.env.GOOGLE_API_KEY,
        instructions,
      }),
    });

    // Accumulate the transcript. Event shape is version-sensitive — this handles the common
    // `conversation_item_added` item ({ role, textContent }); adjust if your version differs.
    session.on('conversation_item_added' as never, ((item: { role?: string; textContent?: string; text?: string }) => {
      const text = item?.textContent ?? item?.text ?? '';
      if (!text) return;
      transcript.push({
        role: item.role === 'assistant' || item.role === 'agent' ? 'agent' : 'candidate',
        text,
        at: Date.now() - startedAt,
      });
    }) as never);

    // Report + shut down when the candidate leaves (or the job ends).
    let reported = false;
    const finish = async () => {
      if (reported) return;
      reported = true;
      clearTimeout(hardStop);
      clearTimeout(wrapUp);
      await reportCompletion(roomName, transcript, startedAt);
    };
    ctx.room.on('participantDisconnected', () => void finish());
    ctx.addShutdownCallback(finish);

    /**
     * Hard duration cap. `maxMinutes` in the prompt is only a suggestion the model may
     * ignore, so an abandoned-but-connected session (muted mic, candidate walked away)
     * would otherwise keep a realtime audio stream open indefinitely — the expensive
     * failure mode. Nudge a wrap-up first, then force the session closed.
     */
    const graceMs = 3 * 60_000;
    const wrapUp = setTimeout(
      () => {
        try {
          session.generateReply({
            instructions:
              'You are out of time. Thank them warmly, tell them the team will review and follow up, and end the conversation now. Do not start a new question.',
          });
        } catch (err) {
          console.error('[agent] wrap-up reply failed:', err);
        }
      },
      interview.maxMinutes * 60_000,
    );
    const hardStop = setTimeout(
      () => {
        console.warn(`[agent] hard time cap reached for ${roomName} — closing session`);
        void finish().finally(() => {
          try {
            ctx.shutdown('interview time limit reached');
          } catch {
            void ctx.room.disconnect();
          }
        });
      },
      interview.maxMinutes * 60_000 + graceMs,
    );

    await session.start({ agent, room: ctx.room });

    session.generateReply({
      instructions:
        'Greet the candidate warmly by name, confirm they can hear you, briefly explain this is a short spoken interview about the role, then ask your first question.',
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
