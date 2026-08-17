BEGIN;

-- GIFs arrived after attachments did. They are a remote URL rather than a file
-- on disk: the picture stays on the provider's CDN and the row only remembers
-- which one was chosen.
ALTER TABLE discussion_attachments DROP CONSTRAINT IF EXISTS discussion_attachments_kind_check;
ALTER TABLE discussion_attachments
  ADD CONSTRAINT discussion_attachments_kind_check CHECK (kind IN ('file','loom','gif'));

COMMIT;
