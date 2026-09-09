BEGIN;

-- Sending paused for the rest of the day, asked for directly on 2026-09-09
-- after the board sweep worked through the whole history of the class and used
-- up most of a month's allowance.
--
-- Until the end of today in Irish time, so it lifts by itself rather than
-- needing somebody to remember. Password resets and invitations are not held:
-- those are messages somebody is sitting waiting for, and holding one does not
-- save an email, it produces a locked-out student.
INSERT INTO app_settings(key, value, updated_at)
VALUES (
  'emailPause',
  jsonb_build_object(
    'until', '2026-09-09T22:59:59.999Z',
    'reason', 'paused for the day after the notification burst'
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

COMMIT;
