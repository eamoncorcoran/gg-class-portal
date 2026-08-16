BEGIN;

-- Not every teaching week wants a check-in going out. Christmas week, a reading
-- week, a week you simply do not want to ask: each week now carries its own
-- switch, its own times, and its own choice of hard or soft deadline.
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS checkin_hard_deadline boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS notes text;

-- A one-off nudge to a student who has not submitted. Separate from the
-- automatic deadline sequence, which only ever fires on a schedule.
INSERT INTO app_settings(key,value)
VALUES ('nudge', jsonb_build_object(
  'checkinSubject', 'Your weekly check-in, {{first_name}}',
  'checkinBody', 'Hi {{first_name}},

I noticed your check-in for {{item_title}} has not come in yet. It only takes two minutes and it genuinely helps me plan the next class around where you are.

You can do it here: {{link}}

No bother at all if you have been busy, just send it on when you get a chance.',
  'homeworkSubject', '{{item_title}} is still open, {{first_name}}',
  'homeworkBody', 'Hi {{first_name}},

Just a gentle nudge that {{item_title}} has not been submitted yet. The deadline is {{deadline}}.

You can pick it up where you left off here: {{link}}

If something is in the way, reply and let me know.'
))
ON CONFLICT (key) DO NOTHING;

COMMIT;
