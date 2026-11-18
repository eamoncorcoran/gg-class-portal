BEGIN;

/* Attachments and voice notes on private messages.
   ------------------------------------------------------------------
   Either side may attach files to a message; the teacher may also record a
   voice note. A student may send only a PDF or a Word document, which is
   decided by what the file is and enforced in src/messagefiles.js, not by this
   table.

   The files themselves are kept in the private store, under a random name, and
   are served only through the authenticated media route, to the student whose
   conversation it is and to the teacher.

   A message may now be an attachment with no words, so the body is allowed to
   be empty. That it is not both empty and without a file is checked where the
   message is made. */
ALTER TABLE private_messages DROP CONSTRAINT IF EXISTS private_messages_body_check;
ALTER TABLE private_messages ADD CONSTRAINT private_messages_body_check CHECK (char_length(body) <= 5000);

CREATE TABLE IF NOT EXISTS private_message_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES private_messages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('file','voice')),
  stored_name text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS private_message_files_message ON private_message_files (message_id);

COMMIT;
