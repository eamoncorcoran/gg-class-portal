BEGIN;

-- A teacher can already hide a comment on the board, which is the blunt
-- instrument: a typo, a wrong date or a sentence that reads worse than it was
-- meant leaves only the choice of removing the whole thing. Editing is the
-- ordinary answer and there was no way to do it.
--
-- Recorded rather than silent. A comment can be edited by somebody who did not
-- write it — that is what moderation is — and rewriting a student's words under
-- the student's name with nothing on the screen to say so would be a small lie
-- told by the software. So the fact of the edit is kept, and shown.
ALTER TABLE discussion_posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
