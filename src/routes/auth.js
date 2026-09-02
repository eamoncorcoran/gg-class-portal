import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, transaction } from '../db.js';
import { asyncRoute } from '../middleware.js';
import { createSession, destroySession, requireAuth } from '../session.js';
import { generateStrongPassword, hashPassword, hashToken, passwordProblems, randomToken, verifyPassword } from '../security.js';
import { sendPasswordChanged, sendPasswordReset } from '../email.js';
import { audit } from '../audit.js';

const router = Router();
/* Both answer in JSON and say how long the wait is. In plain text the client had
   nothing to read and fell back to "Something went wrong" — so somebody locked
   out after twelve attempts was told nothing about why, or that waiting would
   fix it, and the natural next move is to keep trying. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait fifteen minutes and try again, or use “Forgot password”.' },
});
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many password reset requests. Wait an hour and try again.' },
});

router.get('/me', asyncRoute(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: req.user });
}));

/* A face rather than two grey initials.

   The feed is the one screen where this matters: a column of initials reads as a
   spreadsheet, and a column of faces reads as the people who were on the call
   last night. Everybody here meets weekly on video, so there is nothing being
   given away that the group does not already know.

   Stored under a random name and served through an authenticated route, like
   every other file belonging to a student. */
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
});
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

router.post('/avatar', requireAuth, avatarUpload.single('avatar'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a photograph.' });
  const mime = String(req.file.mimetype).split(';')[0];
  if (!AVATAR_TYPES.has(mime)) {
    return res.status(400).json({ error: 'Use a JPEG, PNG or WebP image.' });
  }
  const current = await one('SELECT avatar_path FROM users WHERE id=$1', [req.user.id]);
  const stored = `avatar-${crypto.randomUUID()}`;
  await fs.writeFile(path.join(config.privateUploadDir, stored), req.file.buffer);
  await query(
    'UPDATE users SET avatar_path=$1, avatar_mime=$2, must_set_avatar=false, updated_at=now() WHERE id=$3',
    [stored, mime, req.user.id],
  );
  // Replacing a picture should not leave the old one on disk forever.
  if (current?.avatar_path) {
    await fs.unlink(path.join(config.privateUploadDir, path.basename(current.avatar_path))).catch(() => {});
  }
  await audit({ actorId: req.user.id, action: 'user.avatar_set', entityType: 'user', entityId: req.user.id, ip: req.ip });
  res.status(201).json({ ok: true });
}));

router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = await one('SELECT * FROM users WHERE email=$1', [parsed.data.email.trim()]);
  const valid = user?.active && await verifyPassword(user.password_hash, parsed.data.password);
  if (!valid) {
    await audit({ action: 'auth.login_failed', entityType: 'user', entityId: user?.id, metadata: { email: parsed.data.email }, ip: req.ip });
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  await createSession(user.id, req, res);
  await query('UPDATE users SET last_login_at=now(), updated_at=now() WHERE id=$1', [user.id]);
  await audit({ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: req.ip });
  res.json({ user: {
    id: user.id, role: user.role, name: user.name, email: user.email,
    mustChangePassword: user.must_change_password,
    mustSetAvatar: user.must_set_avatar,
    hasAvatar: Boolean(user.avatar_path),
    isSuperAdmin: Boolean(user.is_super_admin),
  } });
}));

router.post('/logout', asyncRoute(async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
}));

router.post('/change-password', requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Both password fields are required.' });
  const problems = passwordProblems(parsed.data.newPassword);
  if (problems.length) return res.status(400).json({ error: problems.join(' ') });
  const user = await one('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!user || !await verifyPassword(user.password_hash, parsed.data.currentPassword)) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  const nextHash = await hashPassword(parsed.data.newPassword);
  await transaction(async (client) => {
    await client.query('UPDATE users SET password_hash=$1, must_change_password=false, updated_at=now() WHERE id=$2', [nextHash, user.id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [user.id, req.user.sessionId]);
  });
  await sendPasswordChanged({ user }).catch((error) => console.error('Password confirmation email failed', error));
  await audit({ actorId: user.id, action: 'auth.password_changed', entityType: 'user', entityId: user.id, ip: req.ip });
  res.json({ ok: true });
}));

router.post('/forgot-password', resetLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const user = await one('SELECT id,name,email FROM users WHERE email=$1 AND active=true', [email]);
  if (user) {
    const token = randomToken();
    await query(
      `INSERT INTO password_reset_tokens(user_id,token_hash,purpose,expires_at)
       VALUES ($1,$2,'reset',now()+interval '1 hour')`,
      [user.id, hashToken(token)],
    );
    await sendPasswordReset({ user, token }).catch((error) => console.error('Reset email failed', error));
    await audit({ actorId: user.id, action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id, ip: req.ip });
  }
  res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
}));

router.post('/reset-password', resetLimiter, asyncRoute(async (req, res) => {
  const parsed = z.object({ token: z.string().min(20), newPassword: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'The reset link or password is invalid.' });
  const problems = passwordProblems(parsed.data.newPassword);
  if (problems.length) return res.status(400).json({ error: problems.join(' ') });
  const reset = await one(
    `SELECT pr.id token_id, u.* FROM password_reset_tokens pr
     JOIN users u ON u.id=pr.user_id
     WHERE pr.token_hash=$1 AND pr.used_at IS NULL AND pr.expires_at>now()`,
    [hashToken(parsed.data.token)],
  );
  if (!reset) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  const nextHash = await hashPassword(parsed.data.newPassword);
  await transaction(async (client) => {
    await client.query('UPDATE users SET password_hash=$1,must_change_password=false,updated_at=now() WHERE id=$2', [nextHash, reset.id]);
    await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [reset.token_id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1', [reset.id]);
  });
  await sendPasswordChanged({ user: reset }).catch((error) => console.error('Password confirmation email failed', error));
  await audit({ actorId: reset.id, action: 'auth.password_reset_completed', entityType: 'user', entityId: reset.id, ip: req.ip });
  res.json({ ok: true });
}));

router.get('/password-policy', (_req, res) => {
  const example = generateStrongPassword();
  res.json({ minimumLength: 12, requirements: ['lowercase', 'uppercase', 'number', 'symbol'], exampleLength: example.length });
});

export default router;
