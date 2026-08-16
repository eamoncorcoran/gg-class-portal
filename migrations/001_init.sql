BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('admin','student')),
  name text NOT NULL,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('reset','invite')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_name text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Dublin',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_students (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX IF NOT EXISTS class_students_student_idx ON class_students(student_id);

CREATE TABLE IF NOT EXISTS weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  checkin_enabled boolean NOT NULL DEFAULT true,
  checkin_release_at timestamptz NOT NULL,
  checkin_due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, week_start)
);
CREATE INDEX IF NOT EXISTS weeks_class_release_idx ON weeks(class_id, checkin_release_at);

CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('live','partial','missed','recording','unknown')) DEFAULT 'unknown',
  minutes integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(week_id, student_id)
);

CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('draft','submitted','returned')) DEFAULT 'draft',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  ai_feedback text,
  teacher_feedback text,
  feedback_state text NOT NULL CHECK (feedback_state IN ('none','generating','ai_drafted','teacher_edited','returned','failed')) DEFAULT 'none',
  feedback_returned_at timestamptz,
  feedback_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(week_id, student_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  week_id uuid REFERENCES weeks(id) ON DELETE SET NULL,
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  loom_url text,
  visible_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  hard_deadline boolean NOT NULL DEFAULT true,
  reopened_until timestamptz,
  reminders_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('draft','published','archived')) DEFAULT 'published',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_class_deadline_idx ON assignments(class_id, deadline_at);

CREATE TABLE IF NOT EXISTS assignment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  position integer NOT NULL,
  prompt text NOT NULL,
  image_url text,
  required boolean NOT NULL DEFAULT true,
  UNIQUE(assignment_id, position)
);

CREATE TABLE IF NOT EXISTS assignment_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('draft','submitted','returned')) DEFAULT 'draft',
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_question integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  ai_corrections text,
  ai_general_feedback text,
  teacher_corrections text,
  teacher_general_feedback text,
  feedback_state text NOT NULL CHECK (feedback_state IN ('none','generating','ai_drafted','teacher_edited','returned','failed')) DEFAULT 'none',
  feedback_returned_at timestamptz,
  feedback_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES assignments(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  recipient citext NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','sent','failed','simulated')),
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assignment_id, template_key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

INSERT INTO app_settings(key,value)
VALUES
('prompts', jsonb_build_object(
  'checkinPrompt', 'You are a warm, experienced Irish-language teacher replying directly to an adult learner. Base the reply only on the submitted check-in. Acknowledge the weekly win, respond to understanding and confidence, address any support request, and give one practical next step. Keep it to 2 to 4 short sentences. Do not mention AI.',
  'correctionPrompt', 'Analyse the student answers using An Caighdeán Oifigiúil. Correct only genuine errors in spelling, grammar, syntax, punctuation, mutations, verb forms and standard word order. Use the exact repeated format: "<student wording>" followed by a new line and "Correction: <corrected wording>". If there are no genuine corrections, return exactly: No Irish corrections needed.',
  'generalFeedbackPrompt', 'Write a friendly Irish teacher response of 2 to 3 short lines based only on the submitted homework. Mention something done well and give one useful next step. Do not mention AI.'
)),
('reminders', jsonb_build_object(
  'enabled', true,
  'tomorrow', jsonb_build_object('enabled',true,'subject','Your {{assignment_title}} is due tomorrow','body','Hi {{first_name}},\n\nJust a reminder that {{assignment_title}} is due tomorrow at {{deadline_time}}.\n\nContinue here: {{assignment_link}}'),
  'twoHours', jsonb_build_object('enabled',true,'subject','{{assignment_title}} is due in 2 hours','body','Hi {{first_name}},\n\nYour {{assignment_title}} deadline is in 2 hours.\n\nContinue here: {{assignment_link}}'),
  'thirtyMinutes', jsonb_build_object('enabled',true,'subject','30 minutes left for {{assignment_title}}','body','Hi {{first_name}},\n\nThere are 30 minutes remaining before {{assignment_title}} closes.\n\nContinue here: {{assignment_link}}')
))
ON CONFLICT (key) DO NOTHING;

COMMIT;
