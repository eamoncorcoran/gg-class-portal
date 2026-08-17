BEGIN;

-- Videos can now arrive by pasting a link into the body of a post rather than
-- through a separate field, and YouTube joins Loom as somewhere they can come
-- from.
ALTER TABLE discussion_attachments DROP CONSTRAINT IF EXISTS discussion_attachments_kind_check;
ALTER TABLE discussion_attachments
  ADD CONSTRAINT discussion_attachments_kind_check CHECK (kind IN ('file','loom','gif','youtube'));

COMMIT;
