BEGIN;

-- The teacher's own tick on a conversation: dealt with, or still needing a
-- look. Nothing to do with `locked`, which closes a thread to students; this
-- one students never see, and it clears itself the moment a student writes
-- again, so the open list is always "what still needs me".
ALTER TABLE discussion_threads ADD COLUMN IF NOT EXISTS handled_at timestamptz;

COMMIT;
