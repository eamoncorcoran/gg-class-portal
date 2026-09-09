BEGIN;

-- One notice per person per thread was right for announcing a post and wrong
-- for replies: it meant the second reply in a conversation was taken for a
-- repeat of the first and quietly dropped, so somebody heard about a
-- conversation once and never again.
--
-- The two are different questions. A post is announced once per person. A reply
-- is one per person per reply, which the post_id index already covers — so this
-- one steps back to the announcements it was written for.
DROP INDEX IF EXISTS email_deliveries_thread_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_thread_key
  ON email_deliveries(user_id, thread_id, template_key)
  WHERE thread_id IS NOT NULL AND post_id IS NULL;

COMMIT;
