import { DateTime } from 'luxon';
import { config } from './config.js';
import { one, query } from './db.js';
import { hashToken, randomToken } from './security.js';

export async function createSession(userId, req, res) {
  const token = randomToken();
  const expiresAt = DateTime.utc().plus({ days: config.sessionDays }).toJSDate();
  await query(
    `INSERT INTO sessions(user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, hashToken(token), req.get('user-agent')?.slice(0, 500) || null, req.ip || null, expiresAt],
  );
  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  });
}

export async function destroySession(req, res) {
  const token = req.cookies?.[config.sessionCookieName];
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
  res.clearCookie(config.sessionCookieName, { path: '/' });
}

export async function loadSession(req, res, next) {
  const token = req.cookies?.[config.sessionCookieName];
  if (!token) return next();
  const row = await one(
    `SELECT s.id session_id, s.expires_at, s.last_seen_at, u.id, u.role, u.name, u.email, u.active,
            u.must_change_password, u.must_set_avatar, u.avatar_path, u.is_super_admin
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row || !row.active) {
    res.clearCookie(config.sessionCookieName, { path: '/' });
    return next();
  }
  req.user = {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    mustChangePassword: row.must_change_password,
    // Both gates travel with the session so every screen knows whether the
    // person in front of it still owes us something before they can continue.
    mustSetAvatar: row.must_set_avatar,
    hasAvatar: Boolean(row.avatar_path),
    // Creating an administrator is the one action that hands somebody every
    // other action, so it is gated separately from being one.
    isSuperAdmin: Boolean(row.is_super_admin),
    sessionId: row.session_id,
  };
  const lastSeen = new Date(row.last_seen_at || 0).getTime();
  const shouldRoll = Date.now() - lastSeen > 24 * 60 * 60 * 1000;
  if (shouldRoll) {
    const nextExpiry = DateTime.utc().plus({ days: config.sessionDays }).toJSDate();
    await query('UPDATE sessions SET last_seen_at=now(),expires_at=$2 WHERE id=$1', [row.session_id, nextExpiry]);
    res.cookie(config.sessionCookieName, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    });
  } else {
    await query('UPDATE sessions SET last_seen_at=now() WHERE id=$1', [row.session_id]);
  }
  return next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  return next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.user.role !== 'admin' || !req.user.isSuperAdmin) {
    return res.status(403).json({ error: 'Only a super administrator can do that.' });
  }
  return next();
}

export function requireStudent(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  return next();
}
