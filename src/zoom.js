import crypto from 'node:crypto';
import { config } from './config.js';
import { getZoomApiConfig } from './settings.js';

/**
 * Zoom, read-only.
 *
 * A Server-to-Server OAuth app lists the recordings on the account, downloads
 * them, and reads the attendance report of each past sitting of a webinar. It
 * is never given permission to delete anything: the copy on Zoom is the only
 * copy until an import has demonstrably worked, and a bug in here should not
 * be able to destroy a term of teaching.
 *
 * The credentials are pasted in the portal's own settings, with the
 * environment as the fallback. They are read into `current` at boot and again
 * whenever the settings are saved, so the rest of this file can ask
 * `zoomConfigured()` without a database round trip.
 *
 * None of this is a way to embed a Zoom recording; that is not possible, which
 * is the reason a recording is either moved or linked.
 */

const OAUTH = 'https://zoom.us/oauth/token';
const API = 'https://api.zoom.us/v2';

let current = { ...config.zoom };
let cachedToken = null;

export async function refreshZoomApi() {
  try {
    const next = await getZoomApiConfig();
    const changed = ['accountId', 'clientId', 'clientSecret'].some((k) => next[k] !== current[k]);
    current = next;
    if (changed) cachedToken = null;
  } catch (error) {
    console.error('zoom account settings unreadable, using the environment', error?.message);
  }
  return current;
}
export const zoomConfigured = () =>
  Boolean(current.accountId && current.clientId && current.clientSecret);
export const zoomWebhookSecret = () => current.webhookSecret || '';

/* Tokens last an hour. Kept in memory and refreshed a minute early rather than
   fetched per request. */
export async function accessToken() {
  if (!zoomConfigured()) {
    throw Object.assign(new Error('Zoom is not connected.'), { status: 503 });
  }
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;

  const basic = Buffer.from(`${current.clientId}:${current.clientSecret}`).toString('base64');
  const url = `${OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(current.accountId)}`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
  if (!response.ok) {
    cachedToken = null;
    throw Object.assign(new Error('Zoom refused those credentials.'), { status: 502 });
  }
  const payload = await response.json();
  cachedToken = { value: payload.access_token, expires: Date.now() + (payload.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    /* Zoom says exactly what is wrong, and for the one failure a teacher can
       fix themselves, a scope the app was not given, its wording names the
       scope. That wording is worth more than a status code. */
    let detail = '';
    let code = null;
    try { const j = await response.json(); detail = j?.message || ''; code = j?.code ?? null; } catch { /* no body */ }
    const scopes = /does not contain scopes:\s*\[([^\]]+)\]/i.exec(detail)?.[1];
    const message = scopes
      ? `The Zoom app is missing the ${scopes} scope. Add it under Scopes in the Zoom Marketplace app, then try again.`
      : `Zoom returned ${response.status}${detail ? `: ${detail}` : ''}.`;
    throw Object.assign(new Error(message), { status: 502, zoomStatus: response.status, zoomCode: code });
  }
  if (response.status === 204) return null;
  return response.json();
}

/* Who the account is: the owner, as the portal sees it through the app. */
export async function whoAmI() {
  const me = await api('/users/me');
  return { id: me.id, email: me.email, name: [me.first_name, me.last_name].filter(Boolean).join(' '), type: me.type };
}

/**
 * A meeting for right now, hosted by the account's user (or a named one).
 * Settings chosen for a class that joins from inside the portal: no waiting
 * room, no sign-in demanded of attendees, everyone muted on entry, a passcode
 * generated so the link carries one. The start_url is the host's door and
 * carries their key: it is handed back once and never stored.
 */
export async function createInstantMeeting({ topic, host = 'me' } = {}) {
  const meeting = await api(`/users/${encodeURIComponent(host)}/meetings`, {
    method: 'POST',
    body: {
      topic: String(topic || 'Live class').slice(0, 200),
      type: 1,
      settings: {
        host_video: true, participant_video: false, join_before_host: false, mute_upon_entry: true,
        waiting_room: false, meeting_authentication: false, approval_type: 2, auto_recording: 'none',
      },
    },
  });
  return { id: String(meeting.id), joinUrl: meeting.join_url, startUrl: meeting.start_url, passcode: meeting.password || '', topic: meeting.topic };
}

export async function endMeeting(meetingId) {
  await api(`/meetings/${encodeURIComponent(meetingId)}/status`, { method: 'PUT', body: { action: 'end' } });
}

/* The screen-and-speaker recording is the one worth keeping; Zoom also returns
   audio-only files, chat transcripts and a gallery-view cut of the same class. */
const PREFERRED = ['shared_screen_with_speaker_view', 'shared_screen', 'speaker_view', 'active_speaker'];

export function pickFile(files = []) {
  const videos = files.filter((file) => String(file.file_type).toUpperCase() === 'MP4');
  for (const type of PREFERRED) {
    const match = videos.find((file) => file.recording_type === type);
    if (match) return match;
  }
  return videos[0] || null;
}

/**
 * Recordings on the account, newest first.
 *
 * Zoom only returns a month at a time, so the range is walked backwards rather
 * than asked for in one go. Each carries its share link and passcode as well
 * as the file, so a recording can be linked where it cannot be moved.
 */
export async function listRecordings({ months = 3, userId = 'me' } = {}) {
  const out = [];
  const now = new Date();
  for (let step = 0; step < months; step += 1) {
    const to = new Date(now.getFullYear(), now.getMonth() - step + 1, 0);
    const from = new Date(now.getFullYear(), now.getMonth() - step, 1);
    const iso = (date) => date.toISOString().slice(0, 10);
    const payload = await api(
      `/users/${userId}/recordings?from=${iso(from)}&to=${iso(to)}&page_size=300`,
    ).catch(() => ({ meetings: [] }));

    for (const meeting of payload.meetings || []) {
      const file = pickFile(meeting.recording_files);
      if (!file) continue;
      out.push({
        meetingId: String(meeting.id),
        uuid: meeting.uuid,
        topic: meeting.topic,
        startedAt: meeting.start_time,
        durationSeconds: Math.round((meeting.duration || 0) * 60),
        fileId: file.id,
        fileSize: file.file_size,
        downloadUrl: file.download_url,
        shareUrl: meeting.share_url || file.play_url || '',
        passcode: meeting.password || meeting.recording_play_passcode || '',
      });
    }
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/** The MP4 as a stream, so a large recording is never held in memory. */
export async function downloadRecording(downloadUrl) {
  const token = await accessToken();
  const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok || !response.body) {
    throw Object.assign(new Error('Zoom would not hand over that recording.'), { status: 502 });
  }
  return { stream: response.body, size: Number(response.headers.get('content-length')) || 0 };
}

/* ---- Past sittings and who was in them -------------------------------- */

/* A sitting's uuid can start with a slash or carry a double one, and Zoom
   asks for those to be encoded twice. */
const encodeUuid = (uuid) => {
  const s = String(uuid);
  const once = encodeURIComponent(s);
  return (s.startsWith('/') || s.includes('//')) ? encodeURIComponent(once) : once;
};
const notThere = (error) => [400, 404].includes(error?.zoomStatus) || [3001, 1001, 1010, 300].includes(error?.zoomCode);

/**
 * Every past occurrence of a recurring webinar (or meeting), oldest first.
 * A /j/ link can be either, so the webinar endpoint is asked first and the
 * meeting one when Zoom says there is no such webinar.
 */
export async function pastInstances(zoomId) {
  const id = encodeURIComponent(String(zoomId));
  try {
    const r = await api(`/past_webinars/${id}/instances`);
    return { kind: 'webinar', instances: sortInstances(r.webinars) };
  } catch (error) {
    if (!notThere(error)) throw error;
  }
  const r = await api(`/past_meetings/${id}/instances`);
  return { kind: 'meeting', instances: sortInstances(r.meetings) };
}
const sortInstances = (list) => (list || []).map((i) => ({ uuid: i.uuid, startedAt: i.start_time }))
  .filter((i) => i.uuid && i.startedAt).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));

/** When one sitting ran, and for how long. */
export async function pastInstance(uuid, kind = 'webinar') {
  const r = await api(`/${kind === 'meeting' ? 'past_meetings' : 'past_webinars'}/${encodeUuid(uuid)}`);
  return {
    topic: r.topic || '', startedAt: r.start_time, endedAt: r.end_time || null,
    durationMinutes: Number(r.duration) || null, participantsCount: Number(r.participants_count) || null,
  };
}

/**
 * Who was in one sitting and for how long, straight from Zoom's report. A
 * person who dropped and rejoined appears once per spell; summing is the
 * caller's job. Needs the report:read:admin scope.
 */
export async function participantsReport(uuid, kind = 'webinar') {
  const base = `/report/${kind === 'meeting' ? 'meetings' : 'webinars'}/${encodeUuid(uuid)}/participants`;
  const rows = [];
  let token = '';
  for (let page = 0; page < 20; page += 1) {
    const r = await api(`${base}?page_size=300${token ? `&next_page_token=${encodeURIComponent(token)}` : ''}`);
    for (const p of r.participants || []) {
      rows.push({
        id: p.id || p.user_id || '', name: p.name || '', email: p.user_email || '',
        joinedAt: p.join_time || null, leftAt: p.leave_time || null,
        seconds: Number(p.duration) || 0, status: p.status || 'in_meeting',
      });
    }
    token = r.next_page_token || '';
    if (!token) break;
  }
  return rows;
}

/**
 * Verifies a webhook actually came from Zoom.
 *
 * Timing-safe, and refuses outright when no secret is configured rather than
 * accepting everything: an unauthenticated endpoint that creates lessons is
 * worse than no webhook at all.
 */
export function verifyWebhook({ signature, timestamp, rawBody }) {
  const secret = zoomWebhookSecret();
  if (!secret || !signature || !timestamp) return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', secret).update(message).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Zoom proves it owns the endpoint by asking us to sign a nonce back. */
export function urlValidationReply(plainToken) {
  return {
    plainToken,
    encryptedToken: crypto
      .createHmac('sha256', zoomWebhookSecret())
      .update(String(plainToken))
      .digest('hex'),
  };
}
