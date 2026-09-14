BEGIN;

-- The bank of topics a plan covers, as distinct from the weeks they are
-- scheduled into.
--
-- The first import took only the scheduled items, which lost the thirteen topics
-- that are on the course but not yet placed in a week. Those are exactly the
-- ones worth seeing: a list of what still has to find a home is the reason to
-- look at a topic list at all.
CREATE TABLE IF NOT EXISTS plan_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES course_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  -- Which half of the exam it belongs to. Derived from the category on import
  -- and editable afterwards, because the derivation is a reasonable guess about
  -- somebody else's syllabus rather than a fact.
  exam_group text,
  position integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS plan_topics_plan_idx ON plan_topics(plan_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS plan_topics_unique ON plan_topics(plan_id, title);

-- A scheduled item knows which topic it is an appearance of, so the topic list
-- can say which weeks each topic lands in. Nullable and SET NULL: an item
-- written straight into a week is a real thing, and removing a topic from the
-- bank should not silently delete the weeks it was taught in.
ALTER TABLE plan_items
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES plan_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS plan_items_topic_idx ON plan_items(topic_id);

COMMIT;
