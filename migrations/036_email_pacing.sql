BEGIN;

-- Every send, recorded in one place.
--
-- email_deliveries answers "did this person get told about that post", keyed to
-- the thing being announced. It cannot answer "how much mail has this person had
-- in the last hour", because half of what goes out is not about a post at all.
-- Pacing needs the second question, so it gets its own log.
--
-- Suppressed sends are recorded too. A message that was held back and left no
-- trace is indistinguishable from one that was never attempted, and the whole
-- reason for pacing is that somebody wanted to know what the portal is sending.
CREATE TABLE IF NOT EXISTS email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  priority text NOT NULL,
  subject text,
  status text NOT NULL CHECK (status IN ('sent','simulated','suppressed','failed')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The only question this table is asked in the hot path: what has this address
-- had recently.
CREATE INDEX IF NOT EXISTS email_sends_recipient_idx
  ON email_sends(recipient, created_at DESC);

-- A notice that was held back is not a failure, and calling it one would put
-- red errors in the log for the system working as intended.
ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_status_check
  CHECK (status IN ('queued','sent','failed','simulated','suppressed'));

COMMIT;
