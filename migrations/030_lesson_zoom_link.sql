BEGIN;

-- The class recording belongs in Courses, beside the rest of the material,
-- rather than hanging off the teaching week. Weeks are where check-in deadlines
-- live; a student looking for a recording goes to Courses, so that is where the
-- recording goes.
--
-- IF EXISTS on both counts: these columns are only present on a database that
-- ran 029, which was live for less than a day and never held a row.
ALTER TABLE weeks
  DROP COLUMN IF EXISTS recording_url,
  DROP COLUMN IF EXISTS recording_passcode,
  DROP COLUMN IF EXISTS recording_note,
  DROP COLUMN IF EXISTS recording_added_at;

-- A Zoom recording is a link rather than a player: the page asks for a passcode
-- and pushes to open the Zoom app, so an iframe of it is a blank box with
-- nothing to explain itself. The passcode is stored beside the link because a
-- Zoom share link nearly always needs one, and a link handed over without it is
-- a page asking the student for something nobody gave them.
--
-- On the lesson rather than a table of its own, because it is one more thing
-- about the video this lesson already has.
ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS video_passcode text;

-- The list of hosts is enforced in the database as well as in the code, so
-- adding one to VIDEO_PROVIDERS without adding it here means every lesson using
-- it is refused on save — which is what happened the first time this ran.
ALTER TABLE course_lessons
  DROP CONSTRAINT IF EXISTS course_lessons_video_provider_check;
ALTER TABLE course_lessons
  ADD CONSTRAINT course_lessons_video_provider_check
  CHECK (video_provider IS NULL OR video_provider = ANY (ARRAY['bunny','youtube','loom','zoom','mp4']));

COMMIT;
