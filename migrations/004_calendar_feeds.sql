BEGIN;

-- Calendar apps subscribe over plain HTTP with no cookies, so a feed needs its own
-- unguessable URL. The token is per user, revocable by regenerating it, and grants
-- read access to nothing except that person's own deadlines.
ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token text UNIQUE;
CREATE INDEX IF NOT EXISTS users_calendar_token_idx ON users(calendar_token) WHERE calendar_token IS NOT NULL;

-- Archiving is the non-destructive alternative to deleting an assignment that
-- students have already submitted to. Every query already filters on it; this
-- records when and by whom, so the Homework screen can explain itself.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
