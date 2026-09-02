BEGIN;

-- Where a student actually lives, so that things can be posted to them:
-- certificates, course materials, anything that has to arrive on paper.
--
-- On the student rather than in a table of its own, because a person has one
-- current address and the earlier ones are of no interest here. Anything that
-- needed a history would need a reason to keep one.
--
-- Every column is nullable. The address is asked for rather than demanded: a
-- student who has not filled it in yet is a normal state, not a broken record,
-- and the portal has to work perfectly well for somebody who never does.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS address_county text,
  ADD COLUMN IF NOT EXISTS eircode text,
  ADD COLUMN IF NOT EXISTS address_updated_at timestamptz;

COMMIT;
