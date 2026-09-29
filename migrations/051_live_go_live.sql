BEGIN;

/* Going live from the console: the Zoom meeting the portal created for the
   session (so it can be ended from the same button), and when it started,
   which is what tells students "your teacher is live now". */
ALTER TABLE live_access
  ADD COLUMN IF NOT EXISTS meeting_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

COMMIT;
