import crypto from 'node:crypto';
import { config } from './config.js';

function keyBuffer() {
  if (!config.encryptionKey) return null;
  const raw = config.encryptionKey.trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(value) {
  if (!value) return null;
  const key = keyBuffer();
  if (!key) throw new Error('APP_ENCRYPTION_KEY must be configured before storing secrets.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload) {
  if (!payload) return '';
  if (!payload.startsWith('v1.')) return payload;
  const key = keyBuffer();
  if (!key) throw new Error('APP_ENCRYPTION_KEY is required to decrypt stored secrets.');
  const [, ivText, tagText, dataText] = payload.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}
