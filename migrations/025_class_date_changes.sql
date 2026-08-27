/* What happens to one week of the class.
   ------------------------------------------------------------------
   This began as a list of weeks the class did not meet, which is only one of the
   three things that actually happen to a week. A class can be off, it can be
   replaced by a recording, or it can move to another day — and from a student's
   side those are three different messages, not one absence.

   So the table is renamed for what it now holds, and carries the kind:

     skipped   no class that week
     recorded  no live class; there is a recording to watch instead
     moved     the class happens, at the day and time in moved_to

   `moved_to` is a timestamp rather than a date because moving a class usually
   means moving the hour as well.
*/
ALTER TABLE class_skips RENAME TO class_date_changes;
ALTER TABLE class_date_changes RENAME COLUMN skip_on TO on_date;

ALTER TABLE class_date_changes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'skipped';
ALTER TABLE class_date_changes ADD COLUMN IF NOT EXISTS moved_to timestamptz;

ALTER TABLE class_date_changes DROP CONSTRAINT IF EXISTS class_date_changes_kind_check;
ALTER TABLE class_date_changes
  ADD CONSTRAINT class_date_changes_kind_check
  CHECK (kind IN ('skipped', 'recorded', 'moved'));

/* A move with nowhere to move to is the one state that would leave students
   without an answer, so the database refuses it rather than the screen. */
ALTER TABLE class_date_changes DROP CONSTRAINT IF EXISTS class_date_changes_moved_check;
ALTER TABLE class_date_changes
  ADD CONSTRAINT class_date_changes_moved_check
  CHECK (kind <> 'moved' OR moved_to IS NOT NULL);
