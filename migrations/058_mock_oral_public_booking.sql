BEGIN;

/* Booking a mock oral without signing in.
   ------------------------------------------------------------------
   A student opens the link, picks a time and types their name and email, the
   way they would on any booking page. So a booking carries its own name and
   email, and the link to a portal account becomes optional: it is filled in
   when the email is one the portal knows, and left empty when it is not.

   Each booking also gets a private token. It is what the "view or cancel"
   link in the emails carries, since there is no sign-in to say whose it is. */
ALTER TABLE mock_oral_bookings ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE mock_oral_bookings ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE mock_oral_bookings ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE mock_oral_bookings ADD COLUMN IF NOT EXISTS manage_token text;

UPDATE mock_oral_bookings b SET name=u.name, email=lower(u.email)
FROM users u WHERE u.id=b.student_id AND b.email IS NULL;
UPDATE mock_oral_bookings
SET manage_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE manage_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_token
  ON mock_oral_bookings(manage_token);
-- One booking a day for an email address, however it was typed.
CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_email
  ON mock_oral_bookings(day_id, lower(email)) WHERE status='booked' AND email IS NOT NULL;

COMMIT;
