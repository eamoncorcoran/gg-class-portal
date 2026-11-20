BEGIN;

/* The recording's address on Zoom, kept beside every lesson.
   ------------------------------------------------------------------
   A lesson's recording plays inside the hub, copied to Bunny Stream. When that
   player will not play (a signed address gone stale, a browser that blocks the
   frame, Bunny itself down) the student had nothing to fall back on. The link
   to the recording on Zoom's own page, with its passcode, now sits under every
   lesson that came from a Zoom class: "Open Class via Zoom Link".

   What is already known is filled in here: a lesson moved off its Zoom link
   kept that link in lesson_video_moves, and a lesson still on a Zoom link is
   its own link. Lessons the hourly import copied straight to Bunny never kept
   the share link; a sweep after boot asks Zoom for those. */
ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS zoom_link text,
  ADD COLUMN IF NOT EXISTS zoom_link_passcode text;

UPDATE course_lessons l
   SET zoom_link = m.previous_ref, zoom_link_passcode = m.previous_passcode
  FROM lesson_video_moves m
 WHERE m.lesson_id = l.id AND m.previous_provider = 'zoom' AND l.zoom_link IS NULL;

UPDATE course_lessons
   SET zoom_link = video_ref, zoom_link_passcode = video_passcode
 WHERE video_provider = 'zoom' AND zoom_link IS NULL AND video_ref <> '';

COMMIT;
