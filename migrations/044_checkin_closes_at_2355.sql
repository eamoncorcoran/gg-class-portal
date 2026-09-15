BEGIN;

-- Check-ins now close at five to midnight on Sunday rather than a quarter to.
--
-- Only weeks that have not closed yet, and only the ones sitting on the old
-- default. A week whose deadline was set by hand from the Weekly check-ins
-- screen is somebody's decision and is left alone; the match is on the exact
-- minute in the class timezone, which is what the default produced.
--
-- Ten minutes later can only help somebody mid-answer, so this needs no
-- announcement, and a week already closed is not reopened by it.
UPDATE weeks w
SET checkin_due_at = w.checkin_due_at + interval '10 minutes'
FROM classes c
WHERE c.id = w.class_id
  AND w.checkin_due_at > now()
  AND to_char(w.checkin_due_at AT TIME ZONE COALESCE(c.timezone, 'Europe/Dublin'), 'HH24:MI') = '23:45';

COMMIT;
