BEGIN;
-- A video uploaded straight into a post. Pasting a YouTube or Loom link meant
-- putting class material on somebody else's site first, often public, just to
-- show it to twenty people. These go to Bunny Stream from the browser and play
-- back through signed links like the class recordings do; the row keeps the
-- Bunny video id as `bunny:<guid>` and the player address is made per viewer.
ALTER TABLE discussion_attachments DROP CONSTRAINT IF EXISTS discussion_attachments_kind_check;
ALTER TABLE discussion_attachments
  ADD CONSTRAINT discussion_attachments_kind_check CHECK (kind IN ('file','loom','gif','youtube','bunny'));

-- Editing a post. Comments could be edited (026); the post above them could
-- not, so a wrong date in an announcement meant removing it and posting again,
-- which loses the comments under it. Recorded the same way as a comment edit:
-- the board says it was edited, and by whom is kept for the log.
ALTER TABLE discussion_threads
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES users(id) ON DELETE SET NULL;
COMMIT;
