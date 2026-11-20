BEGIN;

/* A private message written now and sent later.
   ------------------------------------------------------------------
   The teacher can write the same note to a whole class and have it land at a
   chosen time, so it arrives when students are awake and reads as a message,
   not a broadcast. Each row is one student's copy: the body already has the
   student's first name in it. The minute sweep that emails about new
   messages sends whatever is due, writing it into the student's conversation
   exactly as a reply typed there would be. sent_at and message_id say it went;
   cancelled_at says the teacher thought better of it before it did. */
CREATE TABLE IF NOT EXISTS private_message_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  send_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  message_id uuid REFERENCES private_messages(id) ON DELETE SET NULL,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS private_message_schedule_due ON private_message_schedule (send_at) WHERE sent_at IS NULL AND cancelled_at IS NULL;

COMMIT;
