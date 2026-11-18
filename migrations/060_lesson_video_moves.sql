BEGIN;

/* Moving a lesson's recording from a Zoom link into the player.
   ------------------------------------------------------------------
   The first lessons of a course were put in by hand as links to the Zoom
   recording, which open in a new tab on Zoom's own page. Later ones are copied
   to Bunny Stream and play inside the lesson. This table is the record of
   bringing an older lesson across: which Zoom recording it was matched to,
   what the lesson pointed at before (so it can be put back), where the copy
   is, and how far along it is.

   The lesson itself is not touched until the copy has finished encoding, so a
   student never opens a lesson to a video that is still being prepared. One
   row per lesson; pressing the button again on a failure reuses the row. */
CREATE TABLE IF NOT EXISTS lesson_video_moves (
  lesson_id uuid PRIMARY KEY REFERENCES course_lessons(id) ON DELETE CASCADE,
  zoom_uuid text NOT NULL,
  zoom_file_id text NOT NULL,
  zoom_started_at timestamptz,
  previous_provider text NOT NULL,
  previous_ref text NOT NULL,
  previous_passcode text,
  bunny_ref text,
  bytes bigint,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','copying','encoding','done','failed')),
  error text,
  actor_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

COMMIT;
