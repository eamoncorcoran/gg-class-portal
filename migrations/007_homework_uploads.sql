BEGIN;

-- Some homework is typed and some is handed up: a photo of handwritten Irish, a
-- scan, a Word document. Turned on per assignment, with the formats you are
-- willing to accept, so students cannot upload something you cannot open.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS allow_uploads boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uploads_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_file_types jsonb NOT NULL DEFAULT '["image","pdf"]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_files integer NOT NULL DEFAULT 3;

-- A student's uploaded work. Kept out of the public uploads path and served only
-- through the authenticated media route, like voice notes. `extracted_text` is
-- what the correction pipeline reads: a photo of handwriting is useless to a
-- text model until it has been read.
CREATE TABLE IF NOT EXISTS homework_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stored_name text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  extracted_text text,
  extraction_state text NOT NULL DEFAULT 'pending'
    CHECK (extraction_state IN ('pending','done','failed','unsupported')),
  extraction_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homework_files_submission_idx ON homework_files(submission_id);

COMMIT;
