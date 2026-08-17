import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Zoom, read-only.
 *
 * A Server-to-Server OAuth app lists the recordings on the account and downloads
 * them. It is never given permission to delete anything: the copy on Zoom is the
 * only copy until an import has demonstrably worked, and a bug in here should not
 * be able to destroy a term of teaching.
 *
 * None of this is a way to embed a Zoom recording — that is not possible, which
 * is the reason the file is being moved at all.
 */

const OAUTH = 'https://zoom.us/oauth/token';
const API = 'https://api.zoom.us/v2';

export const zoomConfigured = () =>
  Boolean(config.zoom.accountId && config.zoom.clientId && config.zoom.clientSecret);

/* Tokens last an hour. Kept in memory and refreshed a minute early rather than
   fetched per request. */
let cachedToken = null;

export async function accessToken() {
  if (!zoomConfigured()) {
    throw Object.assign(new Error('Zoom is not connected.'), { status: 503 });
  }
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;

  const basic = Buffer.from(`${config.zoom.clientId}:${config.zoom.clientSecret}`).toString('base64');
  const url = `${OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(config.zoom.accountId)}`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
  if (!response.ok) {
    cachedToken = null;
    throw Object.assign(new Error('Zoom refused those credentials.'), { status: 502 });
  }
  const payload = await response.json();
  cachedToken = { value: payload.access_token, expires: Date.now() + (payload.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function api(path) {
  const token = await accessToken();
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw Object.assign(new Error(`Zoom returned ${response.status} for ${path}.`), { status: 502 });
  }
  return response.json();
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
 * than asked for in one go.
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

/**
 * Verifies a webhook actually came from Zoom.
 *
 * Timing-safe, and refuses outright when no secret is configured rather than
 * accepting everything — an unauthenticated endpoint that creates lessons is
 * worse than no webhook at all.
 */
export function verifyWebhook({ signature, timestamp, rawBody }) {
  if (!config.zoom.webhookSecret || !signature || !timestamp) return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', config.zoom.webhookSecret).update(message).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Zoom proves it owns the endpoint by asking us to sign a nonce back. */
export function urlValidationReply(plainToken) {
  return {
    plainToken,
    encryptedToken: crypto
      .createHmac('sha256', config.zoom.webhookSecret)
      .update(String(plainToken))
      .digest('hex'),
  };
}
