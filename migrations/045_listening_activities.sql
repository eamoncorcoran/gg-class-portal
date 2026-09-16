BEGIN;

-- A listening activity: a story, read aloud, with comprehension questions.
--
-- Built on the assignment rather than beside it, so everything an assignment
-- already has — a deadline, a week, a submission, the feedback pipeline that
-- holds an AI draft back until the teacher has read it — is had for free.

ALTER TABLE assignments
  -- 'written' is what every existing assignment is, and what the form makes.
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'written',
  -- The story. Plain text: it is read aloud, so formatting has nothing to do.
  ADD COLUMN IF NOT EXISTS listening_text text,
  -- Whether the transcript starts shown or hidden. A student can always toggle
  -- it; this is only where the toggle starts, which is the teacher's call about
  -- how hard the exercise is meant to be.
  ADD COLUMN IF NOT EXISTS listening_text_shown boolean NOT NULL DEFAULT false,
  -- How many times it may be played. NULL means as often as they like.
  ADD COLUMN IF NOT EXISTS listening_max_plays integer;

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_kind_check;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_kind_check CHECK (kind IN ('written', 'listening'));

-- One rendering of one story in one voice.
--
-- Separate rows rather than a column per dialect: the set of voices is ABAIR's
-- to decide, not ours, and a voice that fails to render must not take the
-- others down with it.
CREATE TABLE IF NOT EXISTS listening_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  -- 'ulster' | 'connacht' | 'munster' | 'standard', as offered to the student.
  dialect text NOT NULL,
  -- The provider's own voice id, kept so a re-render uses the same voice.
  voice text,
  -- pending | ready | failed
  state text NOT NULL DEFAULT 'pending',
  error text,
  file_path text,
  mime_type text,
  size_bytes integer,
  seconds integer,
  /* The text this audio is of. A story edited after the audio was made leaves
     the two out of step, and playing last week's recording of a story nobody
     can see any more is worse than saying it needs regenerating. */
  text_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS listening_audio_unique
  ON listening_audio(assignment_id, dialect);

-- What a right answer looks like, so a comprehension question can be marked.
--
-- Never sent to a student. The grading happens on the server and the result
-- goes into the same held-back fields the written feedback already uses.
ALTER TABLE assignment_questions
  ADD COLUMN IF NOT EXISTS expected_answer text,
  ADD COLUMN IF NOT EXISTS marks integer NOT NULL DEFAULT 1;

-- The machine's marking, as working notes for the teacher.
--
-- Alongside ai_corrections rather than replacing it: one is a score per
-- question, the other is prose. Both are stripped on the way to a student until
-- the teacher returns the feedback.
ALTER TABLE homework_submissions
  ADD COLUMN IF NOT EXISTS ai_marks jsonb,
  ADD COLUMN IF NOT EXISTS ai_score integer,
  ADD COLUMN IF NOT EXISTS ai_max integer,
  ADD COLUMN IF NOT EXISTS ai_marked_at timestamptz,
  /* And the teacher's copy, which is what a student eventually sees. The same
     split the written feedback already uses: ai_* is what the model proposed,
     teacher_* is what was approved. A score released without this distinction
     would be the machine's mark with a person's name on it. */
  ADD COLUMN IF NOT EXISTS teacher_marks jsonb,
  ADD COLUMN IF NOT EXISTS teacher_score integer,
  ADD COLUMN IF NOT EXISTS teacher_max integer,
  -- Which dialect they actually listened in, which is worth knowing.
  ADD COLUMN IF NOT EXISTS listening_dialect text,
  ADD COLUMN IF NOT EXISTS listening_plays integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS assignments_kind_idx ON assignments(kind);

COMMIT;
