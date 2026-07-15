# 📋 Project: Linkage — AI-Powered CV Screening
# Place this file at: [project-root]/CLAUDE.md
# This is a worked example for the CV-Screening app. Reuse it as a template for other
# projects by replacing the concrete values with your own.

---

## 🎯 Project Overview

**Name:** ScreenAI — AI-Powered CV Screening & Candidate Analysis
**Type:** Full-stack web app (public applicant portal + protected HR dashboard)
**Stack:** React 19 + Vite + Tailwind 4 · Node.js + Express 5 · TypeScript · Google Gemini
· Supabase Postgres + Drizzle ORM · JWT/bcrypt
**Description:** Candidates apply online and upload a CV. The backend extracts the text,
sends it with the job requirements to Gemini, and stores a structured evaluation
(qualification score, skills match, strengths, concerns, summary, recommendation).
Recruiters review AI-ranked candidates and manage a hiring pipeline.

---

## 🗂 Repository Layout

```
backend/    Express API — CV parsing, Gemini analysis, Drizzle/Supabase, JWT auth
client/     React SPA — public application page + HR dashboard
README.md   Product + setup overview
SETUP_GUIDE.md  Step-by-step environment + run instructions
```

Key backend paths:
```
backend/src/config/env.ts        Zod-validated env (reads GEMINI_API_KEY_CV_SCREENING)
backend/src/db/schema.ts         Drizzle tables: hr_users, jobs, candidates (+ enums)
backend/src/db/client.ts         postgres.js + Drizzle (prepare:false for pooler)
backend/src/services/gemini.ts   Structured extraction + evaluation (single call)
backend/src/services/cvParser.ts PDF (pdf-parse) / DOCX (mammoth) text extraction, signature-verified
backend/src/services/analysis.ts Orchestrates parse→AI→persist; records failures
backend/src/routes/*.ts          auth, jobs, applications, candidates, stats
backend/src/scripts/             seed.ts (HR user), checkConfig.ts (env+DB+AI health)
```

Key client paths:
```
client/src/api/                  client.ts (fetch+JWT), endpoints.ts, types.ts
client/src/auth/                 AuthContext.tsx, RequireAuth.tsx
client/src/pages/                ApplyPage, LoginPage, Dashboard, Jobs, JobDetail,
                                 Candidates, CandidateDetail, NotFound
client/src/components/           ui.tsx, CandidateTable.tsx, JobForm.tsx
```

---

## 👥 Active Agent Team for This Project

| Agent | Role in This Project | Owned Paths |
|-------|---------------------|-------------|
| A03   | Database / Drizzle schema     | backend/src/db/ |
| A04   | API design & routes           | backend/src/routes/, backend/src/lib/validation.ts |
| A05   | Frontend architecture         | client/src/ (structure) |
| A16-backend | Backend codegen         | backend/src/services/, backend/src/routes/, backend/src/middleware/ |
| A16-frontend | Frontend codegen       | client/src/pages/, client/src/components/ |
| A07   | Security audit                | docs/agents/A07-security-audit.md |
| A08   | Test engineering              | backend/**/*.test.ts, client/**/*.test.tsx |
| A15   | Documentation                 | README.md, SETUP_GUIDE.md, docs/ |
| A13   | Technical Lead                | Reviews all outputs |

---

## 🔒 File Ownership Map

**No two agents write the same path in the same phase.**

```
backend/src/db/            → A03 exclusively (schema + migrations)
backend/src/routes/        → A04 / A16-backend
backend/src/services/      → A16-backend
client/src/pages/          → A16-frontend
client/src/components/     → A16-frontend
docs/                      → A15 exclusively
README.md, SETUP_GUIDE.md  → A15 exclusively
```

---

## 🧩 Module Breakdown

| Module | Description | Owner | Depends on |
|--------|-------------|-------|-----------|
| auth        | JWT login, bcrypt, `requireAuth` guard | A16-backend | db |
| jobs        | CRUD + public listing for the apply form | A16-backend | auth, db |
| applications| Public CV upload → parse → analyze → store | A16-backend | jobs, cvParser, gemini |
| candidates  | Ranked list, detail, stage changes, re-analyze, CV download | A16-backend | jobs, db |
| stats       | Dashboard aggregates | A16-backend | db |
| cv-parser   | PDF/DOCX text extraction | A16-backend | — |
| gemini      | Structured extraction + evaluation | A16-backend | config |
| ui (client) | Apply portal + HR dashboard | A16-frontend | api client, auth ctx |

---

## ⚙️ Tech-Specific Instructions

### Database
- ORM: **Drizzle** · DB: **Supabase Postgres** · Migrations: **drizzle-kit** (`db:push`)
- Naming: snake_case columns, camelCase in TS models (Drizzle maps them)
- Connection: **Session pooler** (`...pooler.supabase.com:5432`), `prepare: false`.
  Never use the direct `db.<ref>.supabase.co` host (IPv6-only — fails on IPv4 machines).

### API
- Style: **REST**, prefix `/api`. Auth: **JWT** Bearer (`Authorization: Bearer <token>`)
- Error format: `{ error: { code, message, details? } }` via central error middleware
- Validate every body/query with **Zod** (`backend/src/lib/validation.ts`)
- Public routes: `/api/jobs/public*`, `/api/applications`. Everything else requires auth.

### Frontend
- Framework: **React 19 + Vite** · Styling: **Tailwind CSS 4** (`@theme` brand tokens)
- State: **Context API** for auth; local component state elsewhere (no Redux)
- Routing: **react-router-dom** with a `RequireAuth` guard for `/hr/*`
- API access only through `client/src/api/endpoints.ts` (never raw `fetch` in components)

### AI (Gemini)
- SDK `@google/genai`, model from `GEMINI_MODEL` (default `gemini-2.5-flash`)
- One structured-JSON call returns `{ extraction, evaluation }`; scores clamped 0–100
- Key env var: **`GEMINI_API_KEY_CV_SCREENING`** (fallback `GEMINI_API_KEY`)

---

## 🚀 Commands

```bash
npm run install:all   # install root + backend + client
npm run check         # validate env + Supabase connection + live Gemini call
npm run db:push       # create/update tables in Supabase (drizzle-kit)
npm run seed          # create the first HR user (from SEED_HR_* env vars)
npm run dev           # run API (:4000) + web (:5173) together
npm run build         # typecheck + build both packages
```

---

## 🚫 Project-Specific Constraints

- **Secrets only in `backend/.env`** (git-ignored). `.env.example` uses placeholders.
  Never commit a real `GEMINI_API_KEY_CV_SCREENING`, `DATABASE_URL`, or `JWT_SECRET`.
- Always connect to Supabase via the **pooler**, not the direct host.
- All uploads go through `multer` memory storage with a size limit; validate MIME/extension
  and fail fast on unreadable files before calling the AI.
- AI failures must be recorded on the candidate row (`analysisStatus: 'failed'`), never
  crash the request.
- Candidate PII / raw CV text must never be logged.
- Keep both packages typechecking (`npm run build`) before marking work complete.

---

## 🎯 Current Status

**Phase:** ✅ 1–7 complete (initial build shipped and verified).
**Verified:** env + Supabase pooler connection + live Gemini call all pass `npm run check`;
tables created; one HR user seeded; both packages build.
**Next candidates:** email notifications · duplicate-application detection · analytics ·
move CV storage to Supabase Storage/S3 · automated tests (A08).
