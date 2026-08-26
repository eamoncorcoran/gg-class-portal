/* Getting the backup off the machine it is backing up.
   ------------------------------------------------------------------
   The nightly backup writes to a disk attached to the server. That is real
   protection against the things that usually go wrong — a bad migration, a
   deletion nobody meant, a term wiped by accident — because the copy is right
   there and the restore is quick.

   It is no protection at all against losing the disk. A backup that lives on
   the thing it is backing up is one failure away from being no backup, and the
   night that matters is the night you find out.

   So each night's files are also pushed to object storage somewhere else. It
   speaks S3, which is the one interface every provider offers, so the same code
   works against Backblaze B2, Cloudflare R2, AWS S3 or anything else with an
   endpoint — nothing here is tied to a particular company.

   Configured or not, the local backup runs exactly as before. Off-site is an
   addition, never a dependency: a storage outage must not be able to stop the
   backup that would otherwise have been taken. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';
import { config } from './config.js';

export function offsiteConfigured() {
  const { endpoint, bucket, keyId, secret } = config.offsite;
  return Boolean(endpoint && bucket && keyId && secret);
}

function client() {
  return new AwsClient({
    accessKeyId: config.offsite.keyId,
    secretAccessKey: config.offsite.secret,
    service: 's3',
    region: config.offsite.region || 'auto',
  });
}

/** The address of one object, with the prefix if there is one. */
function objectUrl(name) {
  const base = String(config.offsite.endpoint).replace(/\/+$/, '');
  const prefix = String(config.offsite.prefix || '').replace(/^\/+|\/+$/g, '');
  const key = prefix ? `${prefix}/${name}` : name;
  return `${base}/${config.offsite.bucket}/${key}`;
}

/**
 * Send one file up.
 *
 * Read into memory rather than streamed, because a signed PUT needs the length
 * and the hash before it can be sent. These are gzipped dumps of a text
 * database and a directory of coursework — tens of megabytes, not gigabytes —
 * so the simplicity is worth more than the saving. If that ever stops being
 * true the answer is multipart upload, not a stream.
 */
export async function uploadBackup(filePath) {
  const name = path.basename(filePath);
  const body = await fs.readFile(filePath);
  const response = await client().fetch(objectUrl(name), {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': String(body.length),
    },
  });
  if (!response.ok) {
    // The body carries the provider's own reason, which is far more useful than
    // the status on its own when a key or a bucket name is wrong.
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  return { name, bytes: body.length };
}

/** What is up there already, newest last. */
export async function listBackups() {
  const base = String(config.offsite.endpoint).replace(/\/+$/, '');
  const prefix = String(config.offsite.prefix || '').replace(/^\/+|\/+$/g, '');
  const url = new URL(`${base}/${config.offsite.bucket}`);
  url.searchParams.set('list-type', '2');
  if (prefix) url.searchParams.set('prefix', `${prefix}/`);

  const response = await client().fetch(url.toString());
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const xml = await response.text();

  /* A small, deliberate parse rather than an XML dependency: the only thing
     wanted from a ListObjectsV2 response is the keys. */
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
    .map((match) => match[1])
    .map((key) => (prefix && key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key))
    .sort();
}

export async function deleteBackup(name) {
  const response = await client().fetch(objectUrl(name), { method: 'DELETE' });
  // A 404 means it is already gone, which is the state we wanted anyway.
  if (!response.ok && response.status !== 404) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

/**
 * Prove the whole path works, rather than assuming it.
 *
 * Writes a small object, reads it back, checks the bytes match, and removes it.
 * A write that succeeds while the read fails is a real configuration — a key
 * with put but not get — and it is precisely the configuration that looks fine
 * every night and fails on the one morning it is needed.
 */
export async function verifyOffsite() {
  if (!offsiteConfigured()) return { ok: false, reason: 'Off-site backup is not configured.' };
  const name = `gg-selftest-${Date.now()}.txt`;
  const body = `written by the class portal at ${new Date().toISOString()}`;
  const aws = client();

  const put = await aws.fetch(objectUrl(name), {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'text/plain', 'Content-Length': String(Buffer.byteLength(body)) },
  });
  if (!put.ok) {
    const detail = (await put.text().catch(() => '')).slice(0, 300);
    return { ok: false, reason: `Could not write: ${put.status} ${put.statusText}${detail ? ` — ${detail}` : ''}` };
  }

  const get = await aws.fetch(objectUrl(name));
  if (!get.ok) {
    await deleteBackup(name).catch(() => {});
    return { ok: false, reason: `Wrote, but could not read back: ${get.status} ${get.statusText}. The key may be write-only.` };
  }
  const readBack = await get.text();
  await deleteBackup(name).catch(() => {});

  if (readBack !== body) {
    return { ok: false, reason: 'Read back different content than was written.' };
  }
  return { ok: true, bucket: config.offsite.bucket, endpoint: config.offsite.endpoint };
}
