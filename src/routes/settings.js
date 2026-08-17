import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute } from '../middleware.js';
import { requireAdmin } from '../session.js';
import { getEmailConfig, getOpenAIConfig, getSetting, saveEmailConfig, saveOpenAIConfig, setSetting } from '../settings.js';
import { draftCheckinFeedback } from '../ai.js';
import { sendEmail } from '../email.js';
import { audit } from '../audit.js';

const router = Router();
router.use(requireAdmin);

router.get('/', asyncRoute(async (_req, res) => {
  const [openai, email, prompts, reminders, dictation, voicePrompts, nudge] = await Promise.all([
    getOpenAIConfig(), getEmailConfig(), getSetting('prompts', {}), getSetting('reminders', {}),
    getSetting('dictation', {}), getSetting('voicePrompts', {}), getSetting('nudge', {}),
  ]);
  res.json({
    openai: { configured: openai.configured, model: openai.model },
    email: { ...email, smtpPassword: undefined },
    prompts,
    reminders,
    dictation,
    voicePrompts,
    nudge,
  });
}));

router.put('/openai', asyncRoute(async (req, res) => {
  const parsed = z.object({ apiKey: z.string().optional(), model: z.string().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid model and optional API key.' });
  const saved = await saveOpenAIConfig(parsed.data, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.openai_updated', entityType: 'settings', entityId: 'openai', ip: req.ip });
  res.json(saved);
}));

router.post('/openai/test', asyncRoute(async (_req, res) => {
  const reply = await draftCheckinFeedback({ student: { name: 'Test Student' }, checkin: { weeklyWin: 'I used Irish this week.', understanding: 8, confidence: 7, support: 'No help needed.' } });
  res.json({ ok: true, preview: reply });
}));

router.put('/email', asyncRoute(async (req, res) => {
  const saved = await saveEmailConfig(req.body || {}, req.user.id);
  await audit({ actorId: req.user.id, action: 'settings.email_updated', entityType: 'settings', entityId: 'email', ip: req.ip });
  res.json(saved);
}));

router.post('/email/test', asyncRoute(async (req, res) => {
  const parsed = z.object({ to: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid test email address.' });
  const result = await sendEmail({
    to: parsed.data.to,
    subject: 'Gaeilgeoir Guides email test',
    text: 'Your email settings are working.',
    html: '<p>Your Gaeilgeoir Guides email settings are working.</p>',
    metadata: { type: 'settings_test' },
  });
  res.json({ ok: true, result });
}));

router.put('/prompts', asyncRoute(async (req, res) => {
  const parsed = z.object({
    checkinPrompt: z.string().min(20),
    correctionPrompt: z.string().min(20),
    generalFeedbackPrompt: z.string().min(20),
    // The drafted reply on the class board.
    communityReplyPrompt: z.string().min(20),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Each prompt must contain clear instructions.' });
  await setSetting('prompts', parsed.data, req.user.id);
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
