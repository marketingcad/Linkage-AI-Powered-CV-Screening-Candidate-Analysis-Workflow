# AI Interview Agent

The always-on worker that joins scheduled AI voice interviews and conducts them with Gemini Live.

## How it fits

```
Candidate → /interview page → backend /api/ai-interview/session → creates LiveKit room
                                                                        │ (metadata: job + CV context)
                                                                        ▼
                                                    LiveKit dispatches ── this agent ──▶ Gemini Live
                                                                        │
                        backend  ◀── POST /internal/:room/complete ─────┘  (transcript on candidate leave)
                                   → generates AI summary → HR review card
```

The backend already attaches the interview context (candidate name, job requirements, CV summary,
generated questions) as room metadata, and starts the recording. This worker only runs the
conversation and reports the transcript.

## Run locally

```bash
cd agent
cp .env.example .env    # same LIVEKIT_* + GOOGLE_API_KEY as the backend; set BACKEND_URL + AGENT_SHARED_SECRET
npm install
npm run dev             # connects to LiveKit and waits for interview rooms
```

`AGENT_SHARED_SECRET` must match the backend's env var — it authorizes the completion callback.

## Deploy (Render)

Create a **Background Worker** (not a Web Service — this has no inbound HTTP port):
- Root directory: `agent`
- Build: `npm install`
- Start: `npm start`
- Env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (same project as backend),
  `GOOGLE_API_KEY`, `GEMINI_LIVE_MODEL`, `BACKEND_URL` (your API URL), `AGENT_SHARED_SECRET`.

Or use the included `Dockerfile` with any container host. Scale the worker count to the number
of concurrent interviews you expect (each room needs one agent).

## Version caveats

`@livekit/agents` moves fast — if an import or the transcript event (`conversation_item_added`)
doesn't resolve against the version you install, check the current docs and adjust `src/index.ts`.
