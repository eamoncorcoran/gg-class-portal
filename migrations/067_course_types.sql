BEGIN;

/* What kind of course a class is.
   ------------------------------------------------------------------
   Until now every class was a taught Irish for Primary Teaching group: a weekly
   class on Zoom, check-ins, homework, a board, past questions. A Hibernia
   student bought an on-demand course and nothing else, so their class is a
   different kind of thing: no timetable, no weeks, no reminders, no board, and
   the hub shows them their course and the private line to the teacher only.

   The type lives on the class because enrolment is by class: a student's
   classes decide what they see. A course belongs to a type through the classes
   it is linked to. */
ALTER TABLE classes ADD COLUMN IF NOT EXISTS course_type text NOT NULL DEFAULT 'irish_for_primary';
DO $$ BEGIN
  ALTER TABLE classes ADD CONSTRAINT classes_course_type_check CHECK (course_type IN ('irish_for_primary', 'hibernia'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* A video being copied into the video library for a lesson of an imported
   course. The lesson stays hidden from students until its video has arrived
   and been encoded, so nobody opens a lesson to an empty player. */
CREATE TABLE IF NOT EXISTS lesson_video_imports (
  lesson_id uuid PRIMARY KEY REFERENCES course_lessons(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'copying', 'encoding', 'done', 'failed')),
  bunny_ref text,
  bytes bigint,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS lesson_video_imports_status_idx ON lesson_video_imports(status);

COMMIT;
