BEGIN;

/* Courses: the recordings and the material that go with them, arranged the way
   somebody would work through them rather than the way they happened to be
   posted.

   A course belongs to a class, or to no class at all — `class_id` null means
   every student sees it, which is what a course taught identically to the Monday
   and Thursday groups needs. Scoping it to one class is there for when a course
   genuinely only belongs to one. */
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  -- A draft course is the administrator's alone, so a term can be built out
  -- before anybody is shown a half-finished contents page.
  published boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courses_class_idx ON courses(class_id, position);

/* A section of a course. Every lesson lives in one, because a flat list of
   thirty recordings is a list nobody can find anything in. */
CREATE TABLE IF NOT EXISTS course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_modules_course_idx ON course_modules(course_id, position);

/* One lesson: a recording, and whatever notes go with it.

   `video_provider` is deliberately open rather than tied to one host. A Zoom
   cloud recording cannot be embedded — Zoom blocks framing on its playback
   pages — so the file has to live somewhere that will play it, and which
   somewhere that is should not be baked into the schema. Today it might be a
   streaming host, tomorrow an MP4 on our own disk; the lesson only records
   which kind and where. */
CREATE TABLE IF NOT EXISTS course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  video_provider text CHECK (video_provider IN ('bunny','youtube','loom','mp4')),
  -- The identifier for that provider: a library/video id, a YouTube id, a Loom
  -- id, or a path for a file we serve ourselves.
  video_ref text,
  duration_seconds integer,
  -- Recorded on the day it was taught, so a lesson can say which class it came
  -- from without depending on when it was uploaded.
  recorded_on date,
  published boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_lessons_module_idx ON course_lessons(module_id, position);

/* Handouts belonging to a lesson, reusing the shape the feed already uses for
   its attachments. */
CREATE TABLE IF NOT EXISTS lesson_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  url text NOT NULL,
  stored_name text,
  file_name text,
  mime_type text,
  size_bytes integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_attachments_lesson_idx ON lesson_attachments(lesson_id, position);

/* Progress, per student.

   This is the part worth being careful about. A `complete` flag on the lesson
   itself — which is how more than one course platform has shipped it — means the
   first person to finish a lesson marks it finished for everybody. Progress
   belongs to the person making it. */
CREATE TABLE IF NOT EXISTS lesson_progress (
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  -- Where they got to, so "continue watching" can put them back there.
  last_position_seconds integer NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS lesson_progress_lesson_idx ON lesson_progress(lesson_id);

COMMIT;
