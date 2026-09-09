BEGIN;

-- "2 to 3 short lines" made every reply the same length whatever the work was
-- like, which is one of the things that makes feedback read as written by a
-- machine. When somebody got nearly everything right, the honest response is
-- short, and padding it out to fill a paragraph says less rather than more.
--
-- Replaced only where it is still the wording that shipped, so a prompt
-- somebody has since tuned themselves is left alone.
UPDATE app_settings
SET value = jsonb_set(
      value,
      '{generalFeedbackPrompt}',
      to_jsonb('Write back the way you would type it to the student yourself. Use their first name. Keep it short, and when the work was largely right, keep it very short: a line like "Great job Aoife" with a smiley is a complete response. When there is something worth saying, say that one thing and stop. Do not mention AI.'::text)
    ),
    updated_at = now()
WHERE key = 'prompts'
  AND value->>'generalFeedbackPrompt' LIKE '%2 to 3 short lines%';

COMMIT;
