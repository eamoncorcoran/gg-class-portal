BEGIN;

/* The course materials library is withdrawn. Everything it held is better placed
   either on the assignment it supports or in a post on the class feed, which is
   where people actually look. Uploaded files stay on disk — this drops the rows
   that pointed at them, not the files, so nothing is destroyed that cannot be
   found again in the uploads directory. */
DROP TABLE IF EXISTS materials;

/* Attachments on a post. A PDF the class needs, or a Loom walkthrough that
   should play in place rather than sending somebody to another tab.

   Loom rows carry the share URL and no file; file rows carry both a stored name
   and the original filename, because "Week 4 notes.pdf" is what a reader needs
   to see and a random UUID is what is safe to put on disk. */
CREATE TABLE IF NOT EXISTS discussion_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('file','loom')),
  url text NOT NULL,
  stored_name text,
  file_name text,
  mime_type text,
  size_bytes integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discussion_attachments_thread_idx ON discussion_attachments(thread_id, position);

/* Scheduling. A post with a published_at in the future is the administrator's
   alone until the moment arrives, at which point it simply appears — no job has
   to run, because every read already filters on the clock.

   Existing posts are published as of their creation, so nothing that is already
   up disappears when this runs. */
ALTER TABLE discussion_threads
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
UPDATE discussion_threads SET published_at = created_at WHERE published_at IS NULL;
ALTER TABLE discussion_threads
  ALTER COLUMN published_at SET DEFAULT now(),
  ALTER COLUMN published_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS discussion_threads_published_idx ON discussion_threads(class_id, published_at);

/* Profile pictures.

   A feed of grey initials reads as a form. A feed of faces reads as a room with
   people in it, and on a course where everybody meets weekly on video there is
   nothing to protect by staying anonymous — they already know what each other
   look like.

   `must_set_avatar` gates the way `must_change_password` does. Existing students
   are left alone: pulling the portal out from under somebody mid-term to demand
   a photograph would be a poor trade. Everybody created from here on is asked. */
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_mime text,
  ADD COLUMN IF NOT EXISTS must_set_avatar boolean NOT NULL DEFAULT false;

COMMIT;
