BEGIN;

/* Which webinars are wanted, and which have already been taken.
   ------------------------------------------------------------------
   Nothing is imported because it happens to exist. A Zoom account has years of
   one-to-ones, test calls and meetings that are nobody's business on a class
   portal, so the default is that a recording is listed and ignored until
   somebody says otherwise.

   Two ways to say otherwise: press Import on a recording in the list, or name a
   webinar here as one that should always come across. */
CREATE TABLE IF NOT EXISTS zoom_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Zoom meeting or webinar id. A recurring class keeps the same one every
  -- week, which is what makes this worth having at all.
  zoom_id text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  -- Where an imported recording lands.
  module_id uuid REFERENCES course_modules(id) ON DELETE SET NULL,
  -- Off by default: naming a webinar is not the same as agreeing that every
  -- future one should import without being looked at.
  auto_import boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

/* What has already come across, so nothing is imported twice — by the webhook
   and the scheduled sweep both firing, or by somebody pressing Import on a
   recording that is already in. Failures are kept too: a row that says why it
   did not work is worth more than a silent absence. */
CREATE TABLE IF NOT EXISTS zoom_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoom_uuid text NOT NULL,
  zoom_file_id text NOT NULL,
  zoom_meeting_id text,
  topic text,
  lesson_id uuid REFERENCES course_lessons(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','uploading','done','failed','skipped')),
  error text,
  bytes bigint,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (zoom_uuid, zoom_file_id)
);
CREATE INDEX IF NOT EXISTS zoom_imports_status_idx ON zoom_imports(status, started_at DESC);

COMMIT;
