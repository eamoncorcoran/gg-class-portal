BEGIN;

-- A key the reminder code chooses, so a reminder about something that is not an
-- assignment can still be sent exactly once.
--
-- The delivery log keys on assignment_id, which is the only thing it ever had to
-- remind anybody about. A check-in belongs to a week and a class reminder
-- belongs to one sitting of one class, and neither has an assignment, so both
-- would either collide with each other or never dedupe at all.
--
-- A text key rather than another id column, because the next thing worth a
-- reminder will not be one of these three either.
ALTER TABLE email_deliveries
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_dedupe_key
  ON email_deliveries(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMIT;
