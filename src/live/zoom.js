/**
 * The Zoom Meeting SDK signature.
 *
 * Students only ever get an attendee signature (role 0); the role is not
 * accepted from the client. HS256 by hand with node's crypto: it is three
 * lines of base64, and the client secret never leaves the server. The
 * credentials come from the portal's settings (pasted under Feedback
 * drafting), the environment as the fallback.
 */
import crypto from 'node:crypto';
import { getZoomConfig } from '../settings.js';

const b64url = (input) => Buffer.from(input).toString('base64url');

/** The signature itself, given the credentials: pure, so it can be tested. */
export function signZoomWith({ clientId, clientSecret }, meetingNumber) {
  const mn = String(meetingNumber ?? '').replace(/\D/g, '');
  if (mn.length < 9 || mn.length > 12) throw Object.assign(new Error('A valid webinar ID is required.'), { status: 400 });
  if (!clientId || !clientSecret) throw Object.assign(new Error('The live classroom is not set up on this portal yet.'), { status: 503 });
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 3;
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ appKey: clientId, mn, role: 0, iat, exp, tokenExp: exp }));
  const signature = crypto.createHmac('sha256', clientSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export async function signZoom(meetingNumber) {
  return signZoomWith(await getZoomConfig(), meetingNumber);
}

export async function zoomClientId() {
  return (await getZoomConfig()).clientId;
}

export async function zoomConfigured() {
  return (await getZoomConfig()).configured;
}

/* The live room (the Zoom class inside the portal) is switched on
   deliberately, apart from the studio and practice lessons, which need
   nothing from Zoom. Off by default so a deploy of the studio does not put
   a "Live class" tab in front of students before the teacher is ready. */
export async function liveRoomEnabled() {
  return (await getZoomConfig()).enabled;
}

/** On, and able to mint a signature: what a "Live class" tab needs. */
export async function liveRoomOn() {
  const cfg = await getZoomConfig();
  return cfg.enabled && cfg.configured;
}
