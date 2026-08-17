BEGIN;

/* Super administrators.
   ------------------------------------------------------------------
   Creating an administrator is the one action that can hand somebody every
   other action, so it is not something an ordinary administrator account
   should be able to do. If one is ever compromised, the damage should stop at
   what that account could already see rather than extending to minting more
   accounts like it.

   The founding administrator is promoted so there is always exactly one route
   back in. */
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

UPDATE users SET is_super_admin = true
WHERE id = (SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin = true);

/* A drafted reply to a post on the class board.
   ------------------------------------------------------------------
   Written when an administrator first opens the post rather than when a student
   writes it: most posts get read, only some get replied to, and drafting for
   every one bills for work nobody asked for. Cached here so opening the same
   post twice does not draft it twice.

   Working notes, never sent to a student — the same rule the homework drafts
   already follow. */
ALTER TABLE discussion_threads
  ADD COLUMN IF NOT EXISTS ai_draft text,
  ADD COLUMN IF NOT EXISTS ai_draft_state text NOT NULL DEFAULT 'none'
    CHECK (ai_draft_state IN ('none','drafted','failed')),
  ADD COLUMN IF NOT EXISTS ai_drafted_at timestamptz;

/* A voice note on a comment, the same shape used for returned feedback.
   Recording is the teacher's; hearing it is everybody's. */
ALTER TABLE discussion_posts
  ADD COLUMN IF NOT EXISTS teacher_audio_path text,
  ADD COLUMN IF NOT EXISTS teacher_audio_mime text,
  ADD COLUMN IF NOT EXISTS teacher_audio_seconds integer,
  ADD COLUMN IF NOT EXISTS teacher_audio_recorded_at timestamptz;

/* The prompt for those drafts, editable on the OpenAI screen like the others. */
UPDATE app_settings
SET value = value || jsonb_build_object(
  'communityReplyPrompt',
  'You are a warm, experienced Irish-language teacher replying to a post on your class board. The class are adult learners training to teach in primary school. Answer the question actually asked, in 2 to 4 short sentences, in English unless the question is about Irish wording in which case give the Irish and explain it briefly. Be specific and practical rather than encouraging in general terms. If the post is a win rather than a question, acknowledge the particular thing they did. Never mention being an assistant or a model.'
)
WHERE key = 'prompts' AND NOT (value ? 'communityReplyPrompt');

COMMIT;
