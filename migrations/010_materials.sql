BEGIN;

-- Course materials: the notes, slides, recordings and links that belong to a
-- teaching week but are not homework. Assignments already carry resources, but
-- those only exist to support one piece of work and disappear from view once it
-- has been handed in. This is the library a student comes back to in May.
--
-- A material either points at a file that was uploaded, or at a link. Both are
-- the same row, because from the student's side both are just "open this".
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  -- Null means the material belongs to the course rather than to one week, which
  -- is where a syllabus or a glossary belongs.
  week_id uuid REFERENCES weeks(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('file','link','loom')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  url text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes integer NOT NULL DEFAULT 0,
  -- Unpublished material is visible to the administrator alone, so next week's
  -- notes can be prepared in advance without appearing early.
  published boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_class_idx ON materials(class_id, week_id, position);

COMMIT;
