# Spike: AI Voice Interviewer (Phase 0 proof-of-concept)

> **Status: throwaway spike.** Self-contained, isolated from `backend/` and `client/`.
> It is NOT wired into the main app, the scheduler, or the production build. Delete the
> `spike/` folder to remove it entirely. The goal is to *see and hear it work* and measure
> real latency + cost before committing to the full build.

## What this proves

A candidate opens a link → joins a **LiveKit** WebRTC room (Zoom/Meet-grade) with camera + mic
→ an **AI agent** (Node/TS worker) joins the same room and conducts a spoken interview using the
**Gemini Live API** (native speech-to-speech: listens, reasons, talks back, handles interruptions)
→ the session is **recorded server-side** (LiveKit Egress) to object storage → an HR review page
lists recordings for playback.

```
Candidate browser ──WebRTC──▶  LiveKit room  ◀──WebRTC──  AI agent worker
  (web/, livekit-client)          │  (SFU)                (src/agent.ts, Gemini Live)
                                  │ Egress (composite record)
                                  ▼
                          Object storage (S3 / Supabase Storage)
                                  ▲  webhook: egress_ended
   Express control plane (src/server.ts): issues room tokens, receives webhooks, tracks sessions
```

## Directory map

```
spike/ai-interview/
  src/
    config.ts    env loading + validation, derives the https API url from LIVEKIT_URL
    prompt.ts    builds the interviewer persona/instructions from job + CV (sample data here)
    egress.ts    starts server-side composite recording → S3/Supabase Storage
    server.ts    Express: POST /api/session (room+token+record), POST /api/livekit/webhook, GET /api/sessions
    agent.ts     LiveKit Agents worker — joins the room, runs the Gemini Live voice session
  web/
    index.html   candidate join page (device permission → join → talk to the AI)
    review.html  minimal HR review page (lists recorded sessions)
    main.ts      candidate client (livekit-client)
    review.ts    review client
  vite.config.ts web dev server + /api proxy to the Express server
  schema.sql     interview_sessions table — for when this graduates into the real app
  .env.example   all required/optional config
  package.json   deps + scripts
```

## Prerequisites (provision these first)

1. **LiveKit Cloud** project (free tier is fine for the spike) → gives you
   `LIVEKIT_URL` (`wss://<project>.livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
   Self-hosting LiveKit is possible later; Cloud is fastest to prove the concept.
2. **Gemini API key with Live API access** → `GOOGLE_API_KEY`. This is separate from your CV
   key; the Live API is a different surface. Reuse your Google account/billing.
3. **(Optional, for recording) S3-compatible bucket.** Supabase Storage exposes an S3 endpoint,
   so you can reuse Supabase. Skip this on the very first run to test the *conversation* alone;
   add it once the voice loop works.

## Setup & run

```bash
cd spike/ai-interview
cp .env.example .env          # then fill in the values above
npm install
npm run dev                   # runs server + agent + web together (concurrently)
# ...or three terminals: npm run server | npm run agent | npm run web
```

Open the candidate page (Vite prints the URL, e.g. http://localhost:5180), allow camera + mic,
click **Join**, and talk. The AI ("Robin") should greet you and start interviewing.
HR review page: http://localhost:5180/review.html

## Acceptance criteria — the spike passes if:

- [ ] The AI greets the candidate and asks role-relevant questions **by voice**, one at a time.
- [ ] It handles being interrupted (you talk over it, it stops and listens).
- [ ] End-to-end **turn latency feels conversational** (target < ~1.5 s; measure it).
- [ ] The full session is **recorded** and the file lands in the bucket (if S3 configured).
- [ ] The `egress_ended` webhook fires and the recording appears on the review page.
- [ ] You have a rough **cost-per-interview** number from the LiveKit + Gemini dashboards.

## Cost sketch (validate with your own dashboards)

Per ~20-minute interview, order-of-magnitude:
- LiveKit: participant + egress minutes.
- Gemini Live: realtime **audio** tokens in **and** out (audio is pricier than text — this
  usually dominates).
- Egress render + storage + egress bandwidth.

Put a **hard duration cap** in the agent from day one (see `prompt.ts` / `maxMinutes`).

## ⚠️ Compliance (stubbed here — real before real candidates)

The candidate page has a placeholder consent checkbox only. Before any real applicant uses this:
explicit + logged **recording consent**; disclosure that AI conducts/records the interview
(Illinois AI Video Interview Act); **bias-audit / candidate-notice** obligations for automated
hiring tools (NYC Local Law 144, EU AI Act high-risk); retention + deletion policy; an
accessible non-AI alternative (ADA). Keep a **human as the decision-maker** — the AI assists.

## How this maps to production (no prod code touched yet)

| Spike piece | Production home |
|---|---|
| sample job/CV in `prompt.ts` | real job requirements + stored **CV extraction** + your `interviewQuestions` generator |
| `POST /api/session` room token | a new tokened link type from your **scheduler** (same pattern as apply links) |
| `sessions.json` file | `interview_sessions` table (`schema.sql`) linked to your `interviews` table |
| recording in a bucket | your existing **signed-URL** download pattern; private bucket |
| review page | candidate page video player + synced transcript + a Gemini summary → your **AI/human scorecard** |
| consent checkbox | real consent gate + audit log |

## Known version caveats (verify against current docs when you wire it up)

- The Gemini Live plugin export path has moved between releases — this scaffold uses
  `google.beta.realtime.RealtimeModel`; some versions expose `google.realtime.RealtimeModel`.
  Adjust to whatever `@livekit/agents-plugin-google` you install exports.
- Model id `gemini-2.5-flash-native-audio-preview-12-2025` is a native-audio Live model.
  Avoid `gemini-3.1-flash-live-preview` for now — `generateReply()` is reported broken on it.
- `livekit-server-sdk` v2 `AccessToken.toJwt()` is async (awaited here).
- Because realtime audio + browser media can't be exercised in CI/headless, this scaffold has
  **not been run**; treat first `npm run dev` as the real smoke test.
