BEGIN;

/* One heart was doing too much work. A post can be useful, funny, or the kind of
   small win that deserves a cheer, and on a board this size the reaction is
   often the whole reply — somebody reads your question at eleven at night and
   has nothing to add but wants you to know they read it.

   The existing rows become the heart they already were. */
ALTER TABLE discussion_likes
  ADD COLUMN IF NOT EXISTS emoji text NOT NULL DEFAULT '❤️';

/* The key has to include the emoji: one person may add several different
   reactions to the same post, but only one of each. */
ALTER TABLE discussion_likes DROP CONSTRAINT IF EXISTS discussion_likes_pkey;
ALTER TABLE discussion_likes
  ADD CONSTRAINT discussion_likes_pkey PRIMARY KEY (user_id, target_type, target_id, emoji);

CREATE INDEX IF NOT EXISTS discussion_likes_target_emoji_idx
  ON discussion_likes(target_type, target_id, emoji);

COMMIT;
