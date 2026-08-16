BEGIN;

-- The class board. One board per class, because a question about Monday's lesson
-- is noise to the Thursday group.
--
-- Deliberately plain: a thread has a title and an opening message, and everything
-- after it is a reply in order. No categories, no nesting, no likes. A board of
-- this size — a dozen to forty adults on one course — does not have enough
-- traffic to need sorting into rooms, and empty rooms make a quiet board look
-- abandoned rather than new.
CREATE TABLE IF NOT EXISTS discussion_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  -- Removal is a soft delete. Moderating a live conversation by destroying rows
  -- makes the remaining replies read as answers to nothing, and leaves no way
  -- back from a misclick.
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Carried on the row so the thread list can sort by real activity without
  -- counting replies for every thread on every load.
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discussion_threads_class_idx
  ON discussion_threads(class_id, pinned DESC, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discussion_posts_thread_idx ON discussion_posts(thread_id, created_at);

-- What each person has already seen, so the badge can say "3 new" rather than
-- showing a permanent dot that teaches everyone to ignore it.
CREATE TABLE IF NOT EXISTS discussion_reads (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, class_id)
);

COMMIT;
