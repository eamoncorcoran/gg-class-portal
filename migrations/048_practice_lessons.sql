BEGIN;

-- A practice lesson: a video with phrases the student says aloud, played by the
-- live classroom app inside the portal's course page. `video_ref` holds the
-- studio's lesson id. Added to the constraint here as well as to
-- VIDEO_PROVIDERS, for the reason 030 gives.
ALTER TABLE course_lessons
  DROP CONSTRAINT IF EXISTS course_lessons_video_provider_check;
ALTER TABLE course_lessons
  ADD CONSTRAINT course_lessons_video_provider_check
  CHECK (video_provider IS NULL OR video_provider = ANY (ARRAY['bunny','youtube','loom','zoom','mp4','practice']));

COMMIT;
