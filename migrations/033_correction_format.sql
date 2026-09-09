BEGIN;

-- The marking prompt still told the model to write "Correction:" before every
-- corrected line. The layout now lives in code, where it belongs, and this
-- takes the old instruction out of the stored prompt so the settings screen is
-- not showing something the drafts no longer do.
--
-- Only the sentence about the format is removed. Everything else in that prompt
-- is a marking standard somebody chose, and rewriting it wholesale would throw
-- away a decision that was not ours to make.
UPDATE app_settings
SET value = jsonb_set(
      value,
      '{correctionPrompt}',
      to_jsonb(
        regexp_replace(
          value->>'correctionPrompt',
          'Use the exact repeated format:.*?No Irish corrections needed\.',
          'If there are no genuine corrections, return exactly: No Irish corrections needed.',
          'gs'
        )
      )
    ),
    updated_at = now()
WHERE key = 'prompts'
  AND value->>'correctionPrompt' LIKE '%Correction:%';

COMMIT;
