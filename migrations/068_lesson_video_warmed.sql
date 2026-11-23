BEGIN;
/* When an imported video was last fetched onto the delivery network (see
   warmVideo in src/courseimport.js). Null: not yet, so the next sweep does it. */
ALTER TABLE lesson_video_imports ADD COLUMN IF NOT EXISTS warmed_at timestamptz;
COMMIT;
