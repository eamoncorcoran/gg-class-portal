BEGIN;

/* Attendance read straight from Zoom.
   ------------------------------------------------------------------
   Each class's Zoom link names its webinar or meeting. Zoom keeps a report of
   who was in every past sitting of it and for how long; the portal reads that
   report and writes the attendance the teacher used to upload as a CSV.

   A sitting is one instance of the webinar: one evening's class. It is kept
   whole, participants and all, so the teacher can see who Zoom saw, match a
   name the portal could not, and ask for the week's attendance to be worked
   out again without another trip to Zoom. */
CREATE TABLE IF NOT EXISTS zoom_sittings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  zoom_id text NOT NULL,
  -- Zoom's id for this one occurrence of the recurring webinar.
  zoom_uuid text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'webinar' CHECK (kind IN ('webinar','meeting')),
  topic text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_minutes integer,
  -- The teaching week the sitting fell in, when the portal has one for it.
  week_id uuid REFERENCES weeks(id) ON DELETE SET NULL,
  -- Everyone Zoom saw: name, email, minutes, and the student it was matched to.
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched integer NOT NULL DEFAULT 0,
  unmatched integer NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zoom_sittings_class_idx ON zoom_sittings(class_id, started_at DESC);

/* A name or email Zoom shows that the portal could not place, matched once by
   the teacher and remembered. The key is either email:<address> or
   name:<name as folded>, so the same person is found again next week. */
CREATE TABLE IF NOT EXISTS zoom_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

/* A watched webinar belongs to a class, so its recordings can be checked
   against the courses that class is enrolled in, and may publish on arrival. */
ALTER TABLE zoom_sources ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE zoom_sources ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false;

COMMIT;
