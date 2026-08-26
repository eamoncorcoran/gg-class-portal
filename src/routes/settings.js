import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute } from '../middleware.js';
import { requireAdmin } from '../session.js';
import { getAnthropicConfig, getEmailConfig, getOpenAIConfig, getSetting, saveAnthropicConfig, saveEmailConfig, saveOpenAIConfig, setSetting } from '../settings.js';
import { draftCheckinFeedback } from '../ai.js';
import { sendEmail } from '../email.js';
import { audit } from '../audit.js';

const router = Router();
router.use(requireAdmin);

router.get('/', asyncRoute(async (_req, res) => {
  const [anthropic, openai, email, prompts, reminders, dictation, voicePrompts, nudge] = await Promise.all([
    getAnthropicConfig(), getOpenAIConfig(), getEmailConfig(), getSetting('prompts', {}), getSetting('reminders', {}),
    getSetting('dictation', {}), getSetting('voicePrompts', {}), getSetting('nudge', {}),
  ]);
  res.json({
    anthropic: { configured: anthropic.configured, model: anthropic.model },
    openai: { configured: openai.configured, model: openai.model },
    email: { ...email, smtpPassword: undefined },
    prompts,
    reminders,
    dictation,
    voicePrompts,
    nudge,
  });
}));

/* Drafting runs on Claude. Dictation still runs on OpenAI, so both keys are
   saved from the same screen and neither route touches the other's row. */
/* Anthropic issues more than one kind of key and they are not interchangeable.
   An Admin key administers the organisation — members, workspaces, other keys —
   and cannot call the Messages API at all, so pasting one produces an
   authentication failure that reads exactly like a typo. That sends somebody
   checking a key that was never wrong, only the wrong sort. Recognised here,
   before it is stored, because the prefix says which is which. */
function apiKeyProblem(key) {
  const value = String(key || '').trim();
  if (!value) return null; // Blank means "keep the existing key".
  if (value.startsWith('sk-ant-admin')) {
    return 'That is an Anthropic Admin key. Admin keys manage your organisation — members, workspaces and other keys — and cannot write drafts. You need a standard API key, which begins sk-ant-api. Create one at console.anthropic.com under API Keys.';
  }
  if (!value.startsWith('sk-ant-')) {
    return 'That does not look like an Anthropic API key. They begin sk-ant-api and are created at console.anthropic.com under API Keys.';
  }
  return null;
}

router.put('/anthropic', asyncRoute(async (req, res) => {
  const parsed = z.object({ apiKey: z.string().optional(), model: z.string().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid model and optional API key.' });
  const problem = apiKeyProblem(parsed.data.apiKey);
  if (problem) return res.status(400).json({ error: problem });
  const saved = await saveAnthropicConfig(parsed.data, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.anthropic_updated', entityType: 'settings', entityId: 'anthropic', ip: req.ip });
  res.json(saved);
}));

/* The one route whose whole purpose is to show what a draft sounds like, so it
   drafts a real check-in rather than reporting that the key parses. The student
   is invented and nothing is written to the database. */
router.post('/anthropic/test', asyncRoute(async (_req, res) => {
  try {
    const reply = await draftCheckinFeedback({
      student: { name: 'Niamh' },
      class: { programmeName: 'Irish for Primary Teaching' },
      checkin: {
        attendance: 'I watched the recording',
        reviewed: 'Yes',
        understanding: 5,
        confidence: 4,
        weeklyWin: 'I got one Sraith learned off and said it out loud a few times.',
        support: "I'm finding the Sraith overwhelming, there's so much in learning it.",
      },
    });
    res.json({ ok: true, preview: reply });
  } catch (error) {
    /* Same reasoning as the email test below: a generic "Something went wrong"
       is the least useful sentence available to somebody trying to work out
       which key is wrong. */
    const detail = String(error?.message || error);
    res.status(error?.status === 409 ? 409 : 502).json({
      error: /authentication|api key|401|invalid x-api-key/i.test(detail)
        ? 'Claude rejected that API key. The usual cause is an Admin key rather than a standard one: a standard key begins sk-ant-api and is created at console.anthropic.com under API Keys. A revoked key gives the same error.'
        : detail.slice(0, 400),
    });
  }
}));

router.put('/openai', asyncRoute(async (req, res) => {
  const parsed = z.object({ apiKey: z.string().optional(), model: z.string().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid model and optional API key.' });
  const saved = await saveOpenAIConfig(parsed.data, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.openai_updated', entityType: 'settings', entityId: 'openai', ip: req.ip });
  res.json(saved);
}));

router.put('/email', asyncRoute(async (req, res) => {
  const saved = await saveEmailConfig(req.body || {}, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.email_updated', entityType: 'settings', entityId: 'email', ip: req.ip });
  res.json(saved);
}));

/* SMTP errors quote the conversation back, and the conversation contains the
   credential. Strip anything key-shaped before this reaches a screen or a log. */
function redactSecrets(text) {
  return String(text)
    .replace(/re_[A-Za-z0-9_-]{10,}/g, 're_***')
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '***')
    .slice(0, 400);
}

router.post('/email/test', asyncRoute(async (req, res) => {
  const parsed = z.object({ to: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid test email address.' });
  /* The one route whose entire purpose is to explain a failure. Letting it
     throw sent it to the generic handler, which answers "Something went wrong"
     — the least useful sentence available to somebody trying to find out what
     is wrong. The provider's own words are what identify a rejected key, an
     unverified sending domain or a blocked port, so they are passed through. */
  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: 'Gaeilgeoir Guides email test',
      text: 'Your email settings are working.',
      html: '<p>Your Gaeilgeoir Guides email settings are working.</p>',
      metadata: { type: 'settings_test' },
    });
    res.json({ ok: true, result });
  } catch (error) {
    const detail = String(error?.message || error);
    /* A rejected login is far and away the most common cause, and the raw SMTP
       response says so obliquely. Name it, and name what to do about it. */
    const authFailed = /535|invalid login|authentication|unauthor/i.test(detail);
    res.status(502).json({
      error: authFailed
        ? `The mail server rejected the login. The API key in SMTP_PASSWORD is wrong, revoked, or belongs to a different account. (${redactSecrets(detail)})`
        : `The mail server refused the message: ${redactSecrets(detail)}`,
    });
  }
}));

router.put('/prompts', asyncRoute(async (req, res) => {
  /* The check-in and board voice lives in src/draftprompts.js and is not
     editable here. What is left is notes for this term, appended to that voice
     rather than replacing it, so they are allowed to be empty. The homework
     prompts are still real prompts and still have to say something. */
  const parsed = z.object({
    correctionPrompt: z.string().min(20),
    generalFeedbackPrompt: z.string().min(20),
    checkinNotes: z.string().max(4000).optional().default(''),
    communityNotes: z.string().max(4000).optional().default(''),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Both homework prompts must contain clear instructions.' });
  /* Merge rather than replace, so the retired wording the migration set aside is
     not wiped by the next save from a screen that never knew about it. */
  const current = await getSetting('prompts', {});
  await setSetting('prompts', { ...current, ...parsed.data }, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.prompts_updated', entityType: 'settings', entityId: 'prompts', ip: req.ip });
  res.json(parsed.data);
}));

router.put('/dictation', asyncRoute(async (req, res) => {
  const parsed = z.object({
    transcribeModel: z.string().min(1).max(100),
    cleanupModel: z.string().min(1).max(100),
    language: z.enum(['auto', 'en', 'ga']).default('auto'),
    dictionary: z.array(z.string().min(1).max(120)).max(200).default([]),
    cleanupPrompt: z.string().min(20).max(20000),
    lightPrompt: z.string().min(20).max(20000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter both models and both cleanup prompts.' });
  const { cleanupPrompt, lightPrompt, ...dictation } = parsed.data;
  await setSetting('dictation', dictation, req.user.id);
  await setSetting('voicePrompts', { cleanupPrompt, lightPrompt }, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.dictation_updated', entityType: 'settings', entityId: 'dictation', ip: req.ip });
  res.json({ ...dictation, cleanupPrompt, lightPrompt });
}));

/* The starting wording for a one-off nudge, edited on the Email reminders screen. */
router.put('/nudge', asyncRoute(async (req, res) => {
  const parsed = z.object({
    checkinSubject: z.string().trim().min(1).max(300),
    checkinBody: z.string().trim().min(10).max(8000),
    homeworkSubject: z.string().trim().min(1).max(300),
    homeworkBody: z.string().trim().min(10).max(8000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Both reminder templates need a subject and a message.' });
  await setSetting('nudge', parsed.data, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.nudge_updated', entityType: 'settings', entityId: 'nudge', ip: req.ip });
  res.json(parsed.data);
}));

router.put('/reminders', asyncRoute(async (req, res) => {
  await setSetting('reminders', req.body || {}, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.reminders_updated', entityType: 'settings', entityId: 'reminders', ip: req.ip });
  res.json(req.body || {});
}));

export default router;
