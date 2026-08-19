BEGIN;

/* Not every class has a community.
   ------------------------------------------------------------------
   And in time there will be students who bought a course and belong to no class
   at all. A community nobody is in should not appear in anybody's navigation,
   so whether a class has one is a decision made when the class is created. */
ALTER TABLE classes ADD COLUMN IF NOT EXISTS has_community boolean NOT NULL DEFAULT true;

/* Which classes a course is for.
   ------------------------------------------------------------------
   A course used to belong to one class, or to none meaning everybody. That
   cannot express "these two classes but not the third", which is what enrolling
   a class in a chosen set of courses needs.

   `open_to_all` keeps the old meaning available and, importantly, keeps it
   distinct from the new one: a course with no rows here is enrolled in nothing,
   which is a different thing from a course open to everyone. */
ALTER TABLE courses ADD COLUMN IF NOT EXISTS open_to_all boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS course_classes (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, class_id)
);
CREATE INDEX IF NOT EXISTS course_classes_class_idx ON course_classes(class_id);

-- Carry the existing arrangement across before the old column goes.
UPDATE courses SET open_to_all = true WHERE class_id IS NULL;
INSERT INTO course_classes(course_id, class_id)
SELECT id, class_id FROM courses WHERE class_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE courses DROP COLUMN IF EXISTS class_id;

/* The occasional extra class.
   ------------------------------------------------------------------
   The weekly slot on the class covers the ordinary week. Some weeks carry an
   extra session on another evening, and a student needs the same thing for it
   that they need for the usual one: when, and the link.

   Kept as its own row rather than as a second day on the class, because these
   are exceptions with their own time and their own link, and a class with two
   permanent days is a different thing from a class with an extra session in
   November. */
CREATE TABLE IF NOT EXISTS class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 90,
  join_url text,
  label text NOT NULL DEFAULT '',
  -- Cancelled rather than deleted, so a session announced and then called off
  -- can say so instead of quietly vanishing.
  cancelled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_sessions_class_idx ON class_sessions(class_id, starts_at);

COMMIT;
