-- A live class is a thing that happened, not only a switch that was on.
--
-- Until now the room kept the evening in memory: who was present, who said
-- a phrase, who skipped, and lost it all at the next phrase or the next
-- restart. The teacher wants a report at the end of the class, granular, so
-- the evening is written down as it happens: one row per session, one row
-- per thing a student did in it, and one row per thing the teacher asked
-- the room (understanding check, rating, pop quiz, how was it).

BEGIN;

CREATE TABLE IF NOT EXISTS live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_ids uuid[] NOT NULL DEFAULT '{}',
  join_url text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE live_access ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES live_sessions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS live_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('understand','rating','quiz','enjoy')),
  topic text NOT NULL DEFAULT '',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS live_prompts_session_idx ON live_prompts(session_id, created_at);

CREATE TABLE IF NOT EXISTS live_events (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_events_session_idx ON live_events(session_id, at);
CREATE INDEX IF NOT EXISTS live_events_student_idx ON live_events(session_id, student_id, kind);

COMMIT;
