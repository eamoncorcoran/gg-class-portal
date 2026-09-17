/**
 * The live classroom, from the portal's side.
 *
 * The live room is its own service (~/gg-live-dashboard, run locally as
 * ~/gg-live-integration on 3211). The portal owns who a student is and what
 * they are enrolled in; the live room owns the video and the practice cards.
 * Three things cross the gap, all here:
 *
 *   1. A hand-off token. When a student presses "Join live classroom" the
 *      portal signs a short-lived JWT saying who they are and which class, and
 *      sends them to the live room with it. The live room verifies it with the
 *      shared secret and never has to ask a student to type their name.
 *   2. An entitlements lookup. The live room asks "which classes is this email
 *      in", with a bearer token, and gets ids back. Ids, not names: a renamed
 *      class must never lock anyone out.
 *   3. The webinar. Each class's Zoom join link already lives in Class setup,
 *      so the webinar id and passcode are read out of that rather than kept in
 *      a second place that could disagree with it.
 *
 * The JWT is HS256 by hand with node's crypto, because the portal has no JWT
 * dependency and adding one for three lines of base64 would be silly. The live
 * room reads it with jsonwebtoken, which agrees on the format.
 */
import crypto from 'node:crypto';

export const liveConfig = Object.freeze({
  url: (process.env.LIVE_URL || '').replace(/\/+$/, ''),
  handoffSecret: process.env.LIVE_HANDOFF_SECRET || '',
  entitlementsToken: process.env.LIVE_ENTITLEMENTS_TOKEN || '',
});

export function liveConfigured() {
  return Boolean(liveConfig.url && liveConfig.handoffSecret);
}

const b64url = (input) => Buffer.from(input).toString('base64url');

/** A signed hand-off. Minutes, not hours: it is a doorway, not a session. */
export function signHandoff(payload, { minutes = 5 } = {}) {
  if (!liveConfig.handoffSecret) throw Object.assign(new Error('The live classroom is not set up on this portal.'), { status: 503 });
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + minutes * 60, iss: 'gg-portal' }));
  const signature = crypto.createHmac('sha256', liveConfig.handoffSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** The bearer the live room must present to ask about entitlements. */
export function entitlementsBearerOk(req) {
  const given = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!liveConfig.entitlementsToken || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(liveConfig.entitlementsToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The webinar behind a class's join link.
 *
 * Zoom writes webinar links as /w/<id> and meeting links as /j/<id>, either
 * with ?pwd= on the end. The passcode is often in the class note instead, as
 * "Passcode: 975967", which is what students are shown, so it is read from
 * there too. Spaces inside an id are how Zoom prints them on screen.
 */
export function parseWebinar(joinUrl, joinNote = '') {
  const url = String(joinUrl || '');
  const id = (/\/(?:w|j)\/(\d[\d ]{7,14})/.exec(url) || [])[1]?.replace(/\s+/g, '') || null;
  const pwdFromUrl = (/[?&]pwd=([^&#]+)/.exec(url) || [])[1] || null;
  const pwdFromNote = (/pass\s*code\s*[:\-]?\s*([^\s·|,;]+)/i.exec(String(joinNote || '')) || [])[1] || null;
  return { webinarId: id, webinarPwd: pwdFromUrl || pwdFromNote || '' };
}

/** What the live room is told about a class. */
export function classForLive(row) {
  const day = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Number(row.day_of_week)] || '';
  const { webinarId, webinarPwd } = parseWebinar(row.join_url, row.join_note);
  return {
    id: row.id,
    label: `${row.programme_name} | ${day} | ${String(row.start_time || '').slice(0, 5)}`,
    programme: row.programme_name,
    webinarId, webinarPwd,
    joinUrl: row.join_url || null,
  };
}

/**
 * Ask the live app something, server to server, with the shared token.
 * Six seconds is plenty for a list of lessons and short enough that a live
 * app that is down does not hold a course page open.
 */
export async function liveFetch(pathname) {
  if (!liveConfigured() || !liveConfig.entitlementsToken) {
    throw Object.assign(new Error('The live classroom is not switched on for this portal yet.'), { status: 503 });
  }
  let res;
  try {
    res = await fetch(`${liveConfig.url}${pathname}`, {
      headers: { authorization: `Bearer ${liveConfig.entitlementsToken}` },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw Object.assign(new Error('The live classroom did not answer.'), { status: 502 });
  }
  if (!res.ok) throw Object.assign(new Error('The live classroom did not answer.'), { status: 502 });
  return res.json();
}

/** Where a practice lesson plays: the live app's player, embedded, with a hand-off naming the viewer. */
export function practiceUrl(ref, token) {
  return `${liveConfig.url}/lesson.html?id=${encodeURIComponent(ref)}&embed=1&handoff=${encodeURIComponent(token)}`;
}
