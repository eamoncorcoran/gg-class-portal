import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Bunny Stream: where the class recordings live.
 *
 * Chosen over the alternatives for two reasons. It transcodes to adaptive
 * streaming, which is the whole difference between watchable and unwatchable for
 * a student on mobile data; and its playback URLs can be signed, so a link
 * forwarded to somebody outside the class is refused rather than merely obscure.
 *
 * The API key uploads. The token key signs playback. They are different keys and
 * only the first is ever powerful enough to change anything.
 */

const API = 'https://video.bunnycdn.com/library';
const EMBED = 'https://iframe.mediadelivery.net/embed';

export const bunnyConfigured = () => Boolean(config.bunny.libraryId && config.bunny.apiKey);
export const bunnySigning = () => Boolean(config.bunny.tokenKey);

async function call(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  if (!bunnyConfigured()) {
    throw Object.assign(new Error('Bunny Stream is not configured.'), { status: 503 });
  }
  const response = await fetch(`${API}/${config.bunny.libraryId}${path}`, {
    method,
    headers: { AccessKey: config.bunny.apiKey, ...headers },
    body,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(
      new Error(`Bunny Stream refused the request (${response.status}). ${detail.slice(0, 200)}`),
      { status: 502 },
    );
  }
  return raw ? response : response.json();
}

/** Reserves a video and returns its id, before any bytes are sent. */
export async function createVideo(title) {
  const created = await call('/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: String(title).slice(0, 200) }),
  });
  return created.guid;
}

/**
 * Sends the file.
 *
 * Streamed rather than buffered: a 90-minute recording is comfortably larger
 * than anything worth holding in memory on a small instance.
 */
export async function uploadVideo(videoId, stream, contentLength) {
  await call(`/videos/${videoId}`, {
    method: 'PUT',
    headers: contentLength ? { 'Content-Length': String(contentLength) } : {},
    body: stream,
    // Node needs telling that a stream body is not being duplexed back.
    duplex: 'half',
    raw: true,
  });
  return videoId;
}

export async function videoStatus(videoId) {
  const row = await call(`/videos/${videoId}`);
  return {
    id: row.guid,
    title: row.title,
    // 4 is "finished" in Bunny's encoding states; anything less is still working.
    ready: row.status >= 4,
    status: row.status,
    durationSeconds: Math.round(row.length || 0),
  };
}

/**
 * A playback URL for one viewer, good for a few hours.
 *
 * Without a token key configured this returns the plain embed, which still
 * works — it is simply not restricted. With one, the URL carries a signature
 * Bunny checks and an expiry it enforces, so a link that leaves the class is
 * dead rather than merely unlisted.
 */
export function embedUrl(videoId, { libraryId = config.bunny.libraryId } = {}) {
  if (!bunnySigning()) return `${EMBED}/${libraryId}/${videoId}`;
  const expires = Math.floor(Date.now() / 1000) + config.bunny.tokenHours * 3600;
  const token = crypto
    .createHash('sha256')
    .update(`${config.bunny.tokenKey}${videoId}${expires}`)
    .digest('hex');
  return `${EMBED}/${libraryId}/${videoId}?token=${token}&expires=${expires}`;
}
