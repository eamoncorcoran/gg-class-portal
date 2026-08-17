BEGIN;

/* One reaction each.
   ------------------------------------------------------------------
   Letting somebody hold several at once made the row a scoreboard: five chips
   on a post that four people had seen, and no way to read at a glance how many
   had actually responded. One each means the count under an emoji is a count of
   people, which is the only number anybody was trying to read.

   Choosing a different one replaces what you had rather than adding to it. */

/* Anybody who left more than one keeps their most recent, because the last
   thing you chose is the thing you meant. */
DELETE FROM discussion_likes a
USING discussion_likes b
WHERE a.user_id = b.user_id
  AND a.target_type = b.target_type
  AND a.target_id = b.target_id
  AND (a.created_at, a.emoji) < (b.created_at, b.emoji);

ALTER TABLE discussion_likes DROP CONSTRAINT IF EXISTS discussion_likes_pkey;
ALTER TABLE discussion_likes
  ADD CONSTRAINT discussion_likes_pkey PRIMARY KEY (user_id, target_type, target_id);

COMMIT;
