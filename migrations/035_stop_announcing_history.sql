BEGIN;

-- Every post that already existed was treated as new.
--
-- notified_at was added as a nullable column, so the entire history of the board
-- read as "never announced". The sweep that catches scheduled posts then worked
-- through all of it, twenty posts at a time, every five minutes, emailing the
-- class about conversations that were months old.
--
-- Marked as announced rather than deleted, using the time the post appeared, so
-- the record says what is true: these went out when they were written, and
-- nothing further is owed about them.
UPDATE discussion_threads
SET notified_at = COALESCE(published_at, created_at)
WHERE notified_at IS NULL;

COMMIT;
