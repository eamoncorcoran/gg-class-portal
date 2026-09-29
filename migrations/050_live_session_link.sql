BEGIN;

/* The live session gets its own Zoom link and may be for several classes at
   once, set from the console: the link the teacher is actually hosting today,
   the classes that should see it, and whether anyone else may. The class's
   own link in Class setup stays the fallback when no session link is given. */
ALTER TABLE live_access
  ADD COLUMN IF NOT EXISTS join_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS join_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS class_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE live_access SET class_ids = ARRAY[class_id] WHERE class_id IS NOT NULL AND cardinality(class_ids) = 0;

COMMIT;
