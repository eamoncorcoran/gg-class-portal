BEGIN;

-- The recording of the class itself.
--
-- Courses hold the taught material, which is planned and reused. This is a
-- different thing: the class that ran on one particular Monday, for the person
-- who was sick that week. It belongs to the week rather than to a course,
-- because that is what somebody is looking for when they look for it — "the
-- class I missed" — and next term's week of the same name is a different
-- recording entirely.
--
-- A link rather than a file. Zoom already holds the recording, has already
-- transcoded it and already streams it; copying two gigabytes onto a five
-- gigabyte disk to serve it worse is not an improvement.
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS recording_url text,
  -- Zoom share links usually carry a passcode, and a link without it is a page
  -- that asks for something the student has not got.
  ADD COLUMN IF NOT EXISTS recording_passcode text,
  ADD COLUMN IF NOT EXISTS recording_note text,
  ADD COLUMN IF NOT EXISTS recording_added_at timestamptz;

COMMIT;
