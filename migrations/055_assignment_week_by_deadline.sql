BEGIN;

-- Every assignment sits in the tracker week its deadline falls in, in the
-- class's timezone. The hand-picked week had drifted: some homework had no week
-- and so never appeared on the tracker, and some sat a week away from its
-- deadline after the deadline was edited. Archived ones are re-filed too, so a
-- restore lands in the right column.
UPDATE assignments a
SET week_id = w.id, updated_at = now()
FROM classes c, weeks w
WHERE c.id = a.class_id
  AND w.class_id = a.class_id
  AND w.week_start = (date_trunc('week', a.deadline_at AT TIME ZONE COALESCE(c.timezone, 'Europe/Dublin')))::date
  AND a.week_id IS DISTINCT FROM w.id;

COMMIT;
