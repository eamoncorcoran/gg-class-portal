BEGIN;

-- Replying to a particular comment rather than to the post.
--
-- One level, deliberately: a reply to a reply still hangs off the comment that
-- began the exchange, so a conversation reads as a conversation instead of
-- marching across the screen. That is a decision the drawing makes, not the
-- database — anything deeper is simply drawn at the same indent.
ALTER TABLE discussion_posts
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES discussion_posts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS discussion_posts_parent_idx ON discussion_posts(parent_id);

-- Who wants to hear about the board, and about what.
--
-- On by default, because a board nobody is told about is a board nobody reads.
-- Off is one switch away, and every message says so: somebody who cannot find
-- the switch uses the one their mail client provides instead, and a spam
-- complaint costs the sending domain far more than an unsubscribe does.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_board_posts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_board_replies boolean NOT NULL DEFAULT true;

-- The delivery log stops the same message going twice. It already keys on a
-- thread; a comment needs its own key, or the second comment on a thread would
-- be taken for a repeat of the first and silently dropped.
ALTER TABLE email_deliveries
  ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES discussion_posts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_post_key
  ON email_deliveries(user_id, post_id, template_key)
  WHERE post_id IS NOT NULL;

COMMIT;
