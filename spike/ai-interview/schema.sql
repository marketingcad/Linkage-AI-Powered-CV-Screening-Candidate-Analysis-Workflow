-- Production schema for when the spike graduates into the real app.
-- Mirrors the style of your existing idempotent migrations (migrateScoringColumns.ts):
-- one row per AI interview session, linked to your existing `interviews` table.

CREATE TABLE IF NOT EXISTS interview_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id   uuid REFERENCES interviews(id) ON DELETE CASCADE,
  candidate_id   uuid REFERENCES candidates(id) ON DELETE CASCADE,
  room_name      varchar(128) NOT NULL,
  provider       varchar(32) NOT NULL DEFAULT 'livekit',
  egress_id      varchar(128),
  -- pending → live → recording → processing → ready | failed
  status         varchar(24) NOT NULL DEFAULT 'pending',
  recording_path text,                 -- object-storage key; serve via a signed URL
  transcript     jsonb,                -- [{ role, text, tStart, tEnd }]
  ai_summary     jsonb,                -- Gemini structured eval → feeds the scorecard
  consent_at     timestamptz,          -- when the candidate accepted the recording notice
  started_at     timestamptz,
  ended_at       timestamptz,
  duration_seconds integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_sessions_interview_id_idx ON interview_sessions (interview_id);
CREATE INDEX IF NOT EXISTS interview_sessions_candidate_id_idx ON interview_sessions (candidate_id);
