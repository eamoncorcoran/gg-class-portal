BEGIN;

-- Private notes an administrator keeps about a student: a phone call, a reason for
-- an absence, something to follow up on. Never visible to the student, and kept as
-- an append-only log so the history of a student stays readable over a course.
CREATE TABLE IF NOT EXISTS student_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_notes_student_idx ON student_notes(student_id, created_at DESC);

COMMIT;
