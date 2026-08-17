BEGIN;

-- The board became a feed. What a plain thread list was missing was not features
-- for their own sake: it was the two things that make a small board feel alive.
-- Somewhere obvious to start writing, and visible evidence that other people are
-- reading. Categories give the first a shape, likes give the second a signal that
-- costs one click.

CREATE TABLE IF NOT EXISTS discussion_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, name)
);
CREATE INDEX IF NOT EXISTS discussion_categories_class_idx ON discussion_categories(class_id, position);

-- Null is allowed and means uncategorised, so deleting a category never takes the
-- conversations in it down as well.
ALTER TABLE discussion_threads
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES discussion_categories(id) ON DELETE SET NULL;

/* One table for both, because a like on a reply and a like on a post are the same
   gesture and splitting them doubles every query that counts them. The primary
   key is what stops somebody liking the same thing twice. */
CREATE TABLE IF NOT EXISTS discussion_likes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('thread','post')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS discussion_likes_target_idx ON discussion_likes(target_type, target_id);

/* Every existing class gets the starting set. A board that opens with no
   categories at all asks the teacher to do setup before anybody can post, which
   is exactly the friction that leaves a board empty in week one. */
INSERT INTO discussion_categories(class_id, name, position)
SELECT c.id, v.name, v.position
FROM classes c
CROSS JOIN (VALUES ('General', 0), ('Questions', 1), ('Wins', 2), ('Resources', 3)) AS v(name, position)
ON CONFLICT (class_id, name) DO NOTHING;

-- Anything written before categories existed belongs in General rather than
-- sitting outside the filters where the pills cannot reach it.
UPDATE discussion_threads t
SET category_id = c.id
FROM discussion_categories c
WHERE c.class_id = t.class_id AND c.name = 'General' AND t.category_id IS NULL;

COMMIT;
