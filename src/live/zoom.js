/**
 * The Zoom Meeting SDK signature.
 *
 * Students only ever get an attendee signature (role 0); the role is not
 * accepted from the client. HS256 by hand with node's crypto: it is three
 * lines of base64, and the client secret never leaves this file.
 */
import crypto from 'node:crypto';

export const zoom = Object.freeze({
  clientId: process.env.ZOOM_CLIENT_ID || '',
  clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
});

export function zoomConfigured() {
  return Boolean(zoom.clientId && zoom.clientSecret);
}

const b64url = (input) => Buffer.from(input).toString('base64url');

export function signZoom(meetingNumber) {
  const mn = String(meetingNumber ?? '').replace(/\D/g, '');
  if (mn.length < 9 || mn.length > 12) throw Object.assign(new Error('A valid webinar ID is required.'), { status: 400 });
  if (!zoomConfigured()) throw Object.assign(new Error('The live classroom is not set up on this portal yet.'), { status: 503 });
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 3;
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ appKey: zoom.clientId, sdkKey: zoom.clientId, mn, role: 0, iat, exp, tokenExp: exp }));
  const signature = crypto.createHmac('sha256', zoom.clientSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/* The live room (the Zoom class inside the portal) is switched on
   deliberately, apart from the studio and practice lessons, which need
   nothing from Zoom. Off by default so a deploy of the studio does not put
   a "Live class" tab in front of students before the teacher is ready. */
export function liveRoomEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.LIVE_ROOM_ENABLED || ''));
}
