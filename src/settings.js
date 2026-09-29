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

/* The drafting key. Same shape as the OpenAI one below, and deliberately
   separate from it: drafting and dictation are on different providers now, and
   revoking one should not silently take the other down with it. */
export async function getAnthropicConfig() {
  const stored = await getSetting('anthropic', {});
  let storedKey = '';
  try { storedKey = decryptSecret(stored.apiKeyEncrypted || ''); } catch (error) { console.error(error); }
  return {
    apiKey: storedKey || config.anthropicApiKey,
    model: stored.model || config.anthropicModel,
    configured: Boolean(storedKey || config.anthropicApiKey),
  };
}

export async function saveAnthropicConfig({ apiKey, model }, userId) {
  const current = await getSetting('anthropic', {});
  const next = {
    ...current,
    model: model || current.model || config.anthropicModel,
    apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : current.apiKeyEncrypted || null,
  };
  await setSetting('anthropic', next, userId);
  return { configured: Boolean(next.apiKeyEncrypted || config.anthropicApiKey), model: next.model };
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

/* The speech keys: Azure for the mic and the standard voice, abair.ie for the
   dialect voices. Pasted in the portal's own settings, encrypted at rest, the
   environment as the fallback. Nothing here is ever returned to a browser
   beyond "set" or "not set". Read on every use, so a key pasted just now
   works without a restart; cached for half a minute so a class of students
   pressing "hear it" is not a query each. */
let speechCache = { at: 0, value: null };
export async function getSpeechConfig() {
  if (speechCache.value && Date.now() - speechCache.at < 30 * 1000) return speechCache.value;
  const stored = await getSetting('speech', {});
  let azureKey = '', abairKey = '';
  try { azureKey = decryptSecret(stored.azureKeyEncrypted || ''); } catch (error) { console.error(error); }
  try { abairKey = decryptSecret(stored.abairKeyEncrypted || ''); } catch (error) { console.error(error); }
  const value = {
    azureKey: azureKey || process.env.AZURE_SPEECH_KEY || '',
    azureRegion: stored.azureRegion || process.env.AZURE_SPEECH_REGION || 'southeastasia',
    abairKey: abairKey || process.env.ABAIR_API_KEY || '',
  };
  value.azureConfigured = Boolean(value.azureKey);
  value.abairConfigured = Boolean(value.abairKey);
  speechCache = { at: Date.now(), value };
  return value;
}

export async function saveSpeechConfig({ azureKey, azureRegion, abairKey, clearAzure = false, clearAbair = false }, userId) {
  const current = await getSetting('speech', {});
  const next = {
    ...current,
    azureRegion: String(azureRegion || current.azureRegion || 'southeastasia').trim().toLowerCase(),
    azureKeyEncrypted: clearAzure ? null : (azureKey ? encryptSecret(azureKey.trim()) : current.azureKeyEncrypted || null),
    abairKeyEncrypted: clearAbair ? null : (abairKey ? encryptSecret(abairKey.trim()) : current.abairKeyEncrypted || null),
  };
  await setSetting('speech', next, userId);
  speechCache = { at: 0, value: null };
  const fresh = await getSpeechConfig();
  return { azureConfigured: fresh.azureConfigured, azureRegion: fresh.azureRegion, abairConfigured: fresh.abairConfigured };
}

/** The last speech config read, for callers that cannot wait; primed at start. */
export function speechConfigSync() { return speechCache.value; }

/* The live classroom's Zoom Meeting SDK app: client id, client secret, and
   whether the room is shown at all. Pasted in the portal's own settings,
   encrypted at rest, the environment as the fallback for each. The secret is
   never returned to a browser beyond "set" or "not set"; the client id is
   public by design (it goes into every signature). Cached briefly, since a
   signature is minted per join. */
let zoomCache = { at: 0, value: null };
export async function getZoomConfig() {
  if (zoomCache.value && Date.now() - zoomCache.at < 30 * 1000) return zoomCache.value;
  let stored = {};
  try { stored = await getSetting('zoom', {}); } catch (error) { console.error('zoom settings unreadable, using the environment', error?.message); }
  let secret = '';
  try { secret = decryptSecret(stored.clientSecretEncrypted || ''); } catch (error) { console.error(error); }
  /* The Meeting SDK app is a different Zoom app from the Server-to-Server one
     the recordings import uses, with its own id and secret, so its
     environment fallback has its own names. A stand-in value is not a secret. */
  const envSecret = /placeholder/i.test(process.env.ZOOM_SDK_CLIENT_SECRET || '') ? '' : (process.env.ZOOM_SDK_CLIENT_SECRET || '');
  const value = {
    clientId: (stored.clientId || process.env.ZOOM_SDK_CLIENT_ID || '').trim(),
    clientSecret: secret || envSecret,
    hostEmail: (stored.hostEmail || '').trim(),
    // On unless somebody has switched it off: the tab is the way in, and a
    // room nobody can find is no room. The settings card can still hide it.
    enabled: typeof stored.enabled === 'boolean'
      ? stored.enabled
      : !/^(0|false|no|off)$/i.test(String(process.env.LIVE_ROOM_ENABLED || '')),
  };
  value.configured = Boolean(value.clientId && value.clientSecret);
  zoomCache = { at: Date.now(), value };
  return value;
}

export async function saveZoomConfig({ clientId, clientSecret, enabled, hostEmail, clearSecret = false }, userId) {
  const current = await getSetting('zoom', {});
  const next = {
    ...current,
    clientId: clientId !== undefined ? String(clientId || '').trim() : (current.clientId || ''),
    hostEmail: hostEmail !== undefined ? String(hostEmail || '').trim().toLowerCase() : (current.hostEmail || ''),
    clientSecretEncrypted: clearSecret ? null : (clientSecret ? encryptSecret(clientSecret.trim()) : current.clientSecretEncrypted || null),
    enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
  };
  await setSetting('zoom', next, userId);
  zoomCache = { at: 0, value: null };
  const fresh = await getZoomConfig();
  return { clientId: fresh.clientId, secretConfigured: Boolean(fresh.clientSecret), configured: fresh.configured, enabled: fresh.enabled, hostEmail: fresh.hostEmail };
}
