BEGIN;

-- Every deadline reminder ever sent showed the student "Hi Kacey,\n\nJust a
-- reminder that..." with the backslash and the n visible on screen.
--
-- The templates were seeded in 001_init through an ordinary single-quoted SQL
-- string, where \n is a backslash followed by an n rather than a newline. Only
-- E'' strings interpret the escape. The code then split the body on real
-- newlines, found none, and put the whole thing out as one paragraph with the
-- escapes still in it.
--
-- Repaired in place, so a template somebody has since edited keeps their
-- wording and only the broken escapes change. The rendering also handles a
-- literal \n now, because it is an easy thing to type into a text box and
-- nobody should have to know why it matters.
UPDATE app_settings
SET value = (
      SELECT jsonb_object_agg(
        key,
        CASE
          WHEN jsonb_typeof(entry) = 'object' AND entry ? 'body'
          THEN jsonb_set(entry, '{body}', to_jsonb(replace(entry->>'body', '\n', E'\n')))
          ELSE entry
        END
      )
      FROM jsonb_each(value) AS t(key, entry)
    ),
    updated_at = now()
WHERE key = 'reminders'
  AND value::text LIKE '%\\n%';

COMMIT;
