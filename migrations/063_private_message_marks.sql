BEGIN;

/* A conversation the teacher has marked as unread.
   ------------------------------------------------------------------
   Reading a private message and dealing with it are not the same thing. The
   teacher opens a conversation on a phone between classes, sees it needs a
   proper answer, and wants it to still be waiting when they sit down later.

   This is the teacher's own note and nothing else. It is kept apart from the
   messages on purpose: a message's read_at is what puts "Seen" under it on the
   student's side, and marking a conversation unread must not take that back or
   change anything else a student can see. One row per student whose
   conversation is marked; opening the conversation again, or answering it,
   removes the row. */
CREATE TABLE IF NOT EXISTS private_message_marks (
  student_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  marked_unread_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid
);

COMMIT;
