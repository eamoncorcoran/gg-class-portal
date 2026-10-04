-- Work that was handed in and then turned back into a draft.
--
-- The student's draft autosave set status='draft' on every save unless the
-- piece had been returned, so a student who reopened their submitted homework
-- (the reminder email's link opened the form directly) had the submission
-- silently demoted: gone from the teacher's review queue, and chased by every
-- reminder after. The route no longer demotes; this puts back what it took.
-- A draft with a submitted_at can only have come from that path, since
-- nothing else sets the stamp.

BEGIN;

UPDATE homework_submissions SET status='submitted', updated_at=now()
 WHERE status='draft' AND submitted_at IS NOT NULL;

UPDATE checkins SET status='submitted', updated_at=now()
 WHERE status='draft' AND submitted_at IS NOT NULL;

COMMIT;
