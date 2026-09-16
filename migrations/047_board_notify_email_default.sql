BEGIN;

-- The "email the class" tick on a post, made real.
--
-- The column has been here since 028, defaulting to false, and nothing ever
-- wrote it: the composer's checkbox was stripped by the route's schema, so every
-- teacher post emailed the class whatever the box said. Now the box is honoured,
-- which means the default has to become true, or every existing scheduled post
-- and every post made by the spreadsheet import would fall silent overnight.
-- True is what has actually happened until now, so it is the honest default.
ALTER TABLE discussion_threads ALTER COLUMN notify_email SET DEFAULT true;
UPDATE discussion_threads SET notify_email = true;

COMMIT;
