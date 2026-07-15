# ScreenAI — AI-Powered CV Screening & Candidate Analysis

Automates the first stage of recruitment. Candidates apply online with their CV; the
system extracts their information, evaluates them against the job requirements using
Google Gemini, and presents recruiters with ranked, structured insights.

## What it does

- **Candidate application page** (public) — pick an open role, upload a CV (PDF/DOCX/TXT).
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
