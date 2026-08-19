BEGIN;

/* A soft deadline accepts work after it closes, and says so.
   ------------------------------------------------------------------
   Recorded at the moment of submission rather than worked out later from the
   deadline: an assignment that gets reopened, or a deadline moved after the
   fact, must not silently rewrite whether somebody was late. What was true when
   they pressed the button stays true. */
ALTER TABLE homework_submissions
  ADD COLUMN IF NOT EXISTS submitted_late boolean NOT NULL DEFAULT false;

COMMIT;
