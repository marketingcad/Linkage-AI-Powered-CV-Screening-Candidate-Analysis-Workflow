# ⚡ Setup Guide — Linkage AI-Powered CV Screening

Covers two things:
1. **Running the app** (backend + client, Supabase, Gemini) — the fast path.
2. **The Claude Code multi-agent kit** (global + per-project config) — optional.

---

## Part 1 — Run the app

### Prerequisites
- **Node.js 20+** (tested on 24)
- A **Supabase** project (free tier is fine)
- A **Google Gemini API key** — https://aistudio.google.com/app/apikey

### 1. Install dependencies
```bash
npm run install:all
```
(installs root, `backend/`, and `client/` packages)

### 2. Configure `backend/.env`
Copy the example and fill in three values:
```bash
cp backend/.env.example backend/.env
```

| Variable | What to put |
| --- | --- |
| `DATABASE_URL` | Supabase **Session pooler** URI (see step 3) |
| `GEMINI_API_KEY_CV_SCREENING` | Your Gemini API key |
| `JWT_SECRET` | Any 32-byte+ random string — generate with the command below |

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Get the correct Supabase connection string ⚠️ important
In the Supabase dashboard: **Connect** → **Connection string** → **Session pooler**. It looks like:
```
postgresql://postgres.<project-ref>:<PASSWORD>@aws-<n>-<region>.pooler.supabase.com:5432/postgres
```
- Replace `<PASSWORD>` with your database password.
- Use this **pooler** URI, **not** the "Direct connection" (`db.<ref>.supabase.co`) —
  the direct host is IPv6-only and will not connect on most machines (see Troubleshooting).

### 4. Verify everything before running
```bash
npm run check
```
This validates your env vars, connects to Supabase, checks whether the tables exist, and
makes a **live Gemini call**. Expected output ends with:
```
✅ All configuration checks passed.
```

### 5. Create tables + first HR login
```bash
npm run db:push   # creates hr_users, jobs, candidates (+ enums) in Supabase
npm run seed      # creates the HR login from SEED_HR_* in backend/.env
```
Default seeded login: `hr@example.com` / `ChangeMe123!` — change it after first sign-in.

### 6. Run it
```bash
npm run dev
```
- API → http://localhost:4000
- Web → http://localhost:5173

### 7. Smoke test the workflow
1. Open the web app → **Recruiter login** → sign in.
2. **Jobs → New job** — add a title, description, and required skills.
3. Open a second tab at **http://localhost:5173/apply**, pick the job, upload a CV (PDF/DOCX/TXT).
4. Back in the dashboard, the candidate appears — scored, ranked, with strengths/concerns
   and an AI summary. Open the candidate to see the full analysis and move them through
   the pipeline.

---

## Troubleshooting

**`getaddrinfo ENOTFOUND db.<ref>.supabase.co` or `EADDRNOTAVAIL`**
You're using the **direct** connection string, which is IPv6-only. Switch `DATABASE_URL`
to the **Session pooler** URI (Part 1, step 3). The pooler is served over IPv4.

**`npm run check` says schema tables are missing**
Run `npm run db:push`.

**`npm run check` shows `hr_users=0`**
Run `npm run seed` to create your first recruiter login.

**Gemini check fails**
Confirm `GEMINI_API_KEY_CV_SCREENING` is set in `backend/.env` and the key is active at
https://aistudio.google.com/app/apikey.

**Uploads rejected**
Only PDF, DOCX, and TXT are supported, up to `MAX_UPLOAD_MB` (default 10). Image-only /
scanned PDFs have no extractable text and are rejected by design.

---

## Part 2 — Claude Code multi-agent kit (optional)

### One-time global setup
```bash
npm install -g @anthropic-ai/claude-code
claude login
mkdir -p ~/.claude
cp GLOBAL_CLAUDE.md ~/.claude/CLAUDE.md
```
If you want the experimental agent-team mode, add to `~/.claude/settings.json`:
```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" },
  "teammateMode": "in-process"
}
```

### Per-project setup
```bash
cd your-project
cp PROJECT_CLAUDE_TEMPLATE.md ./CLAUDE.md   # then edit name/stack/modules
claude                                        # CLAUDE.md auto-loads
```
For **this** repo, `PROJECT_CLAUDE_TEMPLATE.md` is already filled in for the CV-Screening
app — copy it to `CLAUDE.md` as-is.

### Kick off a full lifecycle
```
Create an agent team using the Universal Software Engineering Starter Kit.

Project: [description]
Stack:   [defaults from GLOBAL_CLAUDE.md unless noted]

Phase 1 — Run A01 (Requirements) and A14 (Project Planning) in PARALLEL.
Require my approval before Phase 2. Follow the lifecycle in CLAUDE.md.
```

### Targeted commands
```
# Code review → Spawn A06 + A07 on files changed since last commit.
# Bug fix     → Spawn A11. Investigate: [bug].
# New feature → Spawn A04 + A03 in parallel, then A16 to implement.
# Performance → Spawn A17 on [slow feature].
# Docs        → Spawn A15 to regenerate README/SETUP from the code.
```

### Resulting file structure
```
~/.claude/
  CLAUDE.md            ← Global orchestrator (GLOBAL_CLAUDE.md)
  settings.json        ← Agent teams enabled (optional)

your-project/
  CLAUDE.md            ← Per-project config (PROJECT_CLAUDE_TEMPLATE.md, filled in)
  docs/agents/         ← Per-agent markdown outputs
```
