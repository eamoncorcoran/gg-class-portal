BEGIN;

/* The live classroom, merged into the portal.
   ------------------------------------------------------------------
   Two small stores that used to be JSON files beside the live app.

   A live lesson is what the studio builds: a title, a course, optionally a
   video, and the phrases (with a time into the video, or a running order for
   a deck the teacher steps through in class). Phrases stay as one JSON column
   because they are only ever read and written as a whole, by the studio.

   The id is the studio's short hex id rather than a uuid so that the course
   lessons already filed as practice lessons (course_lessons.video_ref) keep
   pointing at the same thing. */
CREATE TABLE IF NOT EXISTS live_lessons (
  id text PRIMARY KEY,
  title text NOT NULL,
  course text NOT NULL DEFAULT '',
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  video_id text NOT NULL DEFAULT '',
  video_type text NOT NULL DEFAULT '',
  phrases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_lessons_course_idx ON live_lessons(course_id, updated_at DESC);

/* Who may join the one live session at a time: everyone signed in, or only
   the class it is for. One row, by construction. */
CREATE TABLE IF NOT EXISTS live_access (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode text NOT NULL DEFAULT 'open' CHECK (mode IN ('open', 'entitled')),
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO live_access(id) VALUES (1) ON CONFLICT DO NOTHING;

COMMIT;
