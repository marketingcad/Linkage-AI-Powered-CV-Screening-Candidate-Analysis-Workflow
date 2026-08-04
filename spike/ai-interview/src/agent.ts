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
import {
  SAMPLE_CONTEXT,
  buildInterviewerInstructions,
  type InterviewContext,
} from './prompt.js';

/**
 * The AI interviewer worker. LiveKit dispatches this agent into interview rooms; it joins,
 * reads the interview context from room metadata, and runs a Gemini Live voice session.
 *
 * Run with:  npm run agent   (which is `tsx src/agent.ts dev`)
 *
 * NOTE: realtime plugin export paths and model ids move between @livekit/agents releases —
 * see the version caveats in README.md if an import or the model id doesn't resolve.
 */
if (!process.env.GOOGLE_API_KEY) {
  throw new Error('[agent] GOOGLE_API_KEY is required for the Gemini Live session — set it in .env');
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    // Interview context is attached to the room by the server (POST /api/session).
    let interview: InterviewContext = SAMPLE_CONTEXT;
    try {
      if (ctx.room.metadata) {
        interview = { ...SAMPLE_CONTEXT, ...(JSON.parse(ctx.room.metadata) as Partial<InterviewContext>) };
      }
    } catch {
      // fall back to the sample context
      console.warn('[agent] failed to parse room metadata, using sample interview context');
    }

    const instructions = buildInterviewerInstructions(interview);

    const agent = new voice.Agent({ instructions });

    const session = new voice.AgentSession({
      // Native speech-to-speech: the model does STT + reasoning + TTS in one low-latency stream.
      llm: new google.beta.realtime.RealtimeModel({
        model: process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025',
        apiKey: process.env.GOOGLE_API_KEY,
        instructions,
      }),
    });

    await session.start({ agent, room: ctx.room });

    // Kick off the conversation so the candidate hears a greeting immediately.
    session.generateReply({
      instructions:
        'Greet the candidate warmly by name, confirm they can hear you, briefly explain this is a short spoken interview about the role, then ask your first question.',
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
