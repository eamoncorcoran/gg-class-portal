BEGIN;

-- Withdrawing is a decision the student makes, recorded once. The account stays,
-- the enrolment stays, and everything they did stays visible — what changes is
-- that nothing further is asked or sent, and the tracker says plainly that they
-- have left.
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
CREATE INDEX IF NOT EXISTS users_withdrawn_idx ON users(withdrawn_at) WHERE withdrawn_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS course_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  reason text NOT NULL,
  detail text,
  overall_rating integer CHECK (overall_rating BETWEEN 1 AND 5),
  teaching_rating integer CHECK (teaching_rating BETWEEN 1 AND 5),
  materials_rating integer CHECK (materials_rating BETWEEN 1 AND 5),
  pace text,
  what_worked text,
  what_to_improve text,
  would_recommend text,
  may_contact boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_withdrawals_class_idx ON course_withdrawals(class_id, submitted_at DESC);

COMMIT;
