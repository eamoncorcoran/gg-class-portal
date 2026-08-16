BEGIN;

-- A hard deadline that has passed cannot be met. Leaving it sitting in the
-- student's Overdue list is a reminder to do something no longer possible, and
-- it pushes the work they can still do further down the page. This lets them
-- clear it away.
--
-- Only the student's own view changes. The tracker still records the week as
-- missed, for their history and for the teacher, so nothing here hides anything
-- from anyone. Kept per student rather than in the browser so clearing it on a
-- phone also clears it on a laptop.
CREATE TABLE IF NOT EXISTS dismissed_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('checkin','homework')),
  -- A week id when kind is checkin, an assignment id when kind is homework.
  ref_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, kind, ref_id)
);

CREATE INDEX IF NOT EXISTS dismissed_deadlines_student_idx ON dismissed_deadlines(student_id);

COMMIT;
