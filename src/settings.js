import { one, query } from './db.js';
import { config } from './config.js';
import { decryptSecret, encryptSecret } from './secrets.js';

export async function getSetting(key, fallback = {}) {
  const row = await one('SELECT value FROM app_settings WHERE key=$1', [key]);
  return row?.value ?? fallback;
}

export async function setSetting(key, value, userId = null) {
  await query(
    `INSERT INTO app_settings(key,value,updated_by,updated_at)
     VALUES ($1,$2::jsonb,$3,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [key, JSON.stringify(value), userId],
  );
}

export async function getOpenAIConfig() {
  const stored = await getSetting('openai', {});
  let storedKey = '';
  try { storedKey = decryptSecret(stored.apiKeyEncrypted || ''); } catch (error) { console.error(error); }
  return {
    apiKey: storedKey || config.openaiApiKey,
    model: stored.model || config.openaiModel,
    configured: Boolean(storedKey || config.openaiApiKey),
  };
}

export async function saveOpenAIConfig({ apiKey, model }, userId) {
  const current = await getSetting('openai', {});
  const next = {
    ...current,
    model: model || current.model || config.openaiModel,
    apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : current.apiKeyEncrypted || null,
  };
  await setSetting('openai', next, userId);
  return { configured: Boolean(next.apiKeyEncrypted || config.openaiApiKey), model: next.model };
}

export async function getEmailConfig() {
  const stored = await getSetting('email', {});
  let smtpPassword = '';
  try { smtpPassword = decryptSecret(stored.smtpPasswordEncrypted || ''); } catch (error) { console.error(error); }
  return {
    provider: stored.provider || config.emailProvider,
    fromName: stored.fromName || config.emailFromName,
    fromAddress: stored.fromAddress || config.emailFromAddress,
    replyTo: stored.replyTo || config.emailReplyTo,
    webhookUrl: stored.webhookUrl || config.ghlEmailWebhookUrl,
    smtpHost: stored.smtpHost || config.smtp.host,
    smtpPort: Number(stored.smtpPort || config.smtp.port),
    smtpSecure: stored.smtpSecure ?? config.smtp.secure,
    smtpUser: stored.smtpUser || config.smtp.user,
    smtpPassword: smtpPassword || config.smtp.password,
    configured: Boolean(
      (stored.provider || config.emailProvider) === 'console' ||
      (stored.webhookUrl || config.ghlEmailWebhookUrl) ||
      ((stored.smtpHost || config.smtp.host) && (smtpPassword || config.smtp.password))
    ),
  };
}

export async function saveEmailConfig(input, userId) {
  const current = await getSetting('email', {});
  const next = {
    ...current,
    provider: input.provider || current.provider || config.emailProvider,
    fromName: input.fromName || current.fromName || config.emailFromName,
    fromAddress: input.fromAddress || current.fromAddress || config.emailFromAddress,
    replyTo: input.replyTo || current.replyTo || config.emailReplyTo,
    webhookUrl: input.webhookUrl ?? current.webhookUrl ?? '',
    smtpHost: input.smtpHost ?? current.smtpHost ?? '',
    smtpPort: Number(input.smtpPort || current.smtpPort || config.smtp.port),
    // Absent means "unchanged", not "off" — otherwise saving any other email
    // setting would quietly turn implicit TLS off for port 465 providers.
    smtpSecure: input.smtpSecure === undefined ? (current.smtpSecure ?? config.smtp.secure) : Boolean(input.smtpSecure),
    smtpUser: input.smtpUser ?? current.smtpUser ?? '',
    smtpPasswordEncrypted: input.smtpPassword ? encryptSecret(input.smtpPassword) : current.smtpPasswordEncrypted || null,
  };
  await setSetting('email', next, userId);
  return { provider: next.provider, configured: true };
}
