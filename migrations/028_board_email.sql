BEGIN;

-- Posting to the board told nobody. A student saw a post when they next opened
-- the portal, which for something time-sensitive — a class moved, a class
-- cancelled — is too late to be worth saying.
--
-- Not every post is worth an email, so it is a choice made per post rather than
-- a rule applied to all of them. A board that emails everybody about everything
-- gets muted, and then it cannot tell them the thing that mattered.
ALTER TABLE discussion_threads
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- A scheduled post has to be emailed when it appears, not when it was written,
-- so the sweep needs to find the ones still owed an email. Partial, because that
-- is a handful of rows out of all of them.
CREATE INDEX IF NOT EXISTS discussion_threads_pending_email_idx
  ON discussion_threads(published_at)
  WHERE notify_email = true AND notified_at IS NULL AND deleted_at IS NULL;

-- The delivery log already stops a deadline reminder going twice; the same has
-- to be true here, and more so — a duplicate reminder is an annoyance, and a
-- board post emailed twice to a whole class is the sort of thing people
-- unsubscribe over.
ALTER TABLE email_deliveries
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES discussion_threads(id) ON DELETE CASCADE;

-- Its own index rather than the existing constraint, because that one is over
-- assignment_id: in a unique constraint two NULLs count as different, so a row
-- with no assignment is unique against everything and would never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_thread_key
  ON email_deliveries(user_id, thread_id, template_key)
  WHERE thread_id IS NOT NULL;

COMMIT;
