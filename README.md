# ScreenAI — AI-Powered CV Screening & Candidate Analysis

Automates the first stage of recruitment. Candidates apply online with their CV; the
system extracts their information, evaluates them against the job requirements using
Google Gemini, and presents recruiters with ranked, structured insights.



## What it does

- **Candidate application page** (public) — pick an open role, upload a CV (PDF or DOCX).
- **Automatic CV parsing** — text is extracted from the uploaded file.
- **AI extraction & scoring** (Gemini) — skills, work experience, education, certifications,
  a qualification score (0–100), skills-match score, strengths, concerns/gaps, a summary,
  and a recommendation.
- **HR dashboard** (JWT-protected) — overview stats, job management, candidates ranked by
  score, full per-candidate analysis, pipeline stages (new → shortlisted → interviewing →
  hired / rejected), CV download, and one-click re-analysis.

## Tech stack

| Layer     | Choice                                             |
| --------- | -------------------------------------------------- |
| Frontend  | React 19 + TypeScript + Vite + Tailwind CSS 4      |
| Backend   | Node.js + Express 5 + TypeScript                    |
| AI        | Google Gemini (`@google/genai`, `gemini-2.5-flash`)|
| Database  | Supabase Postgres via Drizzle ORM                  |
| Parsing   | `pdf-parse` (PDF) + `mammoth` (DOCX)               |
| Auth      | JWT + bcrypt                                        |
| Storage   | Local disk (`backend/uploads/`) — swappable        |

## Project layout

```
backend/    Express API, Drizzle schema, Gemini + CV-parsing services
client/     React SPA (candidate application + HR dashboard)
```

## Prerequisites

- Node.js 20+ (tested on 24)
- A Supabase project (free tier is fine)
- A Google Gemini API key — https://aistudio.google.com/app/apikey

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure the backend environment

`backend/.env` already exists with your Gemini key and a generated `JWT_SECRET`.
Fill in your Supabase connection string:

1. Supabase Dashboard → your project → **Project Settings → Database**.
2. Under **Connection string**, choose **Connection pooling** (Transaction mode).
3. Copy the URI and replace `[YOUR-PASSWORD]` with your database password.
4. Paste it as `DATABASE_URL` in `backend/.env`.

```env
DATABASE_URL=postgresql://postgres.xxxx:YOUR-PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres
GEMINI_API_KEY_CV_SCREENING=your-key   # already set
JWT_SECRET=...                          # already generated
```

### 3. Create the database tables

```bash
npm run db:push
```

This pushes the Drizzle schema (`hr_users`, `jobs`, `candidates` + enums) to Supabase.

### 4. Create your first recruiter login

Credentials come from `SEED_HR_EMAIL` / `SEED_HR_PASSWORD` in `backend/.env`
(defaults: `hr@example.com` / `ChangeMe123!`).

```bash
npm run seed
```

### 5. Run it

```bash
npm run dev
```

- API → http://localhost:4000
- Web → http://localhost:5173

Open the web app, click **Recruiter login**, sign in, create a job (set required skills),
then open the candidate application page (`/apply`) in another tab and submit a CV. The
candidate appears — scored and ranked — in the dashboard within seconds.

## Deployment (Vercel + Render)

Recommended topology:

| Piece                | Host      | Type                    |
| -------------------- | --------- | ----------------------- |
| Backend (Express API)| Render    | Web Service (Node)      |
| Frontend (Vite SPA)  | Vercel    | Static site             |
| Database             | Supabase  | Already hosted (Postgres) |

Deploy in this order — the frontend needs the backend URL, and the backend's CORS
needs the frontend URL:

1. Push the repo to GitHub (Render and Vercel both deploy from it).
2. Deploy the **backend to Render** → note its URL.
3. Deploy the **frontend to Vercel** with that URL → note its URL.
4. Set the backend's `CORS_ORIGIN` / `APP_PUBLIC_URL` to the Vercel URL and redeploy.

### 1. Backend → Render

Render → **New → Web Service** → connect the GitHub repo, then:

| Setting          | Value                                  |
| ---------------- | -------------------------------------- |
| Root Directory   | `backend`                              |
| Runtime          | Node                                    |
| Build Command    | `npm install --include=dev && npm run build` |
| Start Command    | `npm start`                            |
| Instance type    | Free works (note cold starts below)    |

> **Why `--include=dev`:** Render sets `NODE_ENV=production`, which makes `npm install`
> skip `devDependencies` — but the build needs `typescript` (`tsc`). `--include=dev`
> forces them to install so the build (and `tsx` for `seed`/`db:push`) works.

**Environment variables** (Render → your service → *Environment*):

```env
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres
JWT_SECRET=your-long-random-secret
GEMINI_API_KEY_CV_SCREENING=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash            # optional
NODE_ENV=production
CORS_ORIGIN=https://your-app.vercel.app  # set after step 2 (comma-separate for previews)
APP_PUBLIC_URL=https://your-app.vercel.app   # used for tracking links in emails
# SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM  — optional; if unset, emails are logged not sent
```

- **Do not set `PORT`** — Render injects it and the server reads `process.env.PORT`.
- Use the **same Supabase pooler `DATABASE_URL`** as local (see Setup step 2).

**Database & seed:** the schema lives in the same Supabase project, so if you already
ran `npm run db:push` / `npm run seed` locally you're done. Otherwise run them once
against the production DB — either locally with the production `DATABASE_URL`, or from
the Render **Shell** tab:

```bash
npm run db:push   # create tables
npm run seed      # create the first HR user
```

After it goes live, sanity-check the API:
`https://<your-service>.onrender.com/api/jobs/public` should return JSON.

> **⚠️ CV storage is ephemeral on Render.** Uploaded CVs are written to
> `backend/uploads/` (local disk), which Render **wipes on every redeploy/restart** —
> CV downloads for older candidates will break. For production, attach a **Render Disk**
> mounted at `backend/uploads` (and set `UPLOAD_DIR` to match) or migrate storage to
> Supabase Storage / S3.

### 2. Frontend → Vercel

Vercel → **Add New → Project** → import the repo, then:

| Setting          | Value                          |
| ---------------- | ------------------------------ |
| Root Directory   | `client`                       |
| Framework Preset | Vite                           |
| Build Command    | `npm run build` (default)      |
| Output Directory | `dist` (default)               |

**Environment variable** (Vercel → Project → *Settings → Environment Variables*):

```env
VITE_API_URL=https://<your-service>.onrender.com/api
```

- The value **must end in `/api`** — the client appends paths like `/auth/login` to it.
- Vite only exposes vars prefixed `VITE_`, and they're baked in at build time, so
  **redeploy** after changing it.

**SPA routing:** deep links such as `/apply/:jobId` must fall back to `index.html` or
they 404 on refresh. This repo includes [`client/vercel.json`](client/vercel.json) with
the required rewrite:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### 3. Connect them (CORS)

Back in Render, set `CORS_ORIGIN` (and `APP_PUBLIC_URL`) to the Vercel URL from step 2
and **redeploy the backend**. To also allow Vercel preview deployments, comma-separate:
`CORS_ORIGIN=https://your-app.vercel.app,https://your-app-git-*.vercel.app`.

### 4. Post-deploy checklist

- Open the Vercel URL, **Recruiter login** with the seeded credentials, then change the password.
- Create a job, open `/apply`, submit a CV, and confirm the candidate appears scored.
- (Optional) Add custom domains on both platforms and update `CORS_ORIGIN` / `APP_PUBLIC_URL` / `VITE_API_URL` accordingly.

> **Cold starts:** Render's free tier spins the service down after ~15 min idle; the
> first request then takes 30–60s to wake. Combined with Gemini latency, the first
> application after idle is slow. Use a paid instance (or an uptime pinger) for a
> production feel.

## API overview

| Method | Route                          | Auth | Purpose                                  |
| ------ | ------------------------------ | ---- | ---------------------------------------- |
| POST   | `/api/auth/login`              | –    | Recruiter login → JWT                    |
| GET    | `/api/auth/me`                 | ✔    | Current user                             |
| GET    | `/api/jobs/public`             | –    | Open jobs (for the application form)     |
| POST   | `/api/applications`           | –    | Submit a CV → parse + AI analyze + store |
| GET    | `/api/jobs`                    | ✔    | List jobs (with candidate counts)        |
| POST   | `/api/jobs`                    | ✔    | Create a job                             |
| PUT    | `/api/jobs/:id`                | ✔    | Update a job                             |
| DELETE | `/api/jobs/:id`                | ✔    | Delete a job                             |
| GET    | `/api/candidates?jobId&stage`  | ✔    | Ranked candidates                        |
| GET    | `/api/candidates/:id`          | ✔    | Full candidate analysis                  |
| PATCH  | `/api/candidates/:id/stage`    | ✔    | Move pipeline stage                      |
| POST   | `/api/candidates/:id/reanalyze`| ✔    | Re-run AI analysis                       |
| GET    | `/api/candidates/:id/cv`       | ✔    | Download original CV                     |
| GET    | `/api/stats`                   | ✔    | Dashboard totals                         |

## How the AI scoring works

For each application the backend sends the extracted CV text plus the structured job
requirements to Gemini in a single call that returns validated JSON (via a response
schema). It contains both the **extraction** (skills, experience, education,
certifications, total years) and the **evaluation** (scores, per-skill matches,
strengths, concerns, summary, recommendation). Scores are clamped to 0–100 and stored on
the candidate row so the dashboard can rank instantly.

## Security notes

- **Move the Gemini key out of `backend/.env.example`.** The real key currently lives
  there; `.env.example` is normally committed. Keep secrets only in `backend/.env`
  (git-ignored) and put a placeholder in the example file.
- Change the seeded HR password after first login.

## Possible next steps

Job-description auto-matching, duplicate-application detection, email notifications,
recruitment analytics, and moving CV storage to Supabase Storage / S3.
```
