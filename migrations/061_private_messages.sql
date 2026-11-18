BEGIN;

/* Private messages between a student and the teacher.
   ------------------------------------------------------------------
   The private line used to be a chat widget from another company, loaded into
   one page of the portal. Messages left the portal, replies were written in a
   different inbox, and when the widget did not load there was no line at all.

   Now it is a conversation kept here. There is one per student and it never
   ends: everything the student and the teacher have ever written to each other
   privately is one long thread, read top to bottom. So there is no thread
   table. A message belongs to a student; the student's messages are the
   conversation.

   read_at is when the other side opened the conversation after this message
   arrived. emailed_at is when a notification about it went out; a message read
   in the portal before that happens is never emailed about at all. */
CREATE TABLE IF NOT EXISTS private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_teacher boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  emailed_at timestamptz
);

CREATE INDEX IF NOT EXISTS private_messages_thread ON private_messages (student_id, created_at);
CREATE INDEX IF NOT EXISTS private_messages_to_announce ON private_messages (created_at) WHERE emailed_at IS NULL AND read_at IS NULL;

COMMIT;
