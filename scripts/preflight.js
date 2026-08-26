import { spawnSync } from 'node:child_process';
import { config } from '../src/config.js';

const errors = [];
const warnings = [];

/* The backup is the one feature whose failure is silent until the night it
   matters, so say plainly at boot whether it can actually run. A version
   mismatch against the server needs no guess here: pg_dump refuses loudly and
   the reason lands in the log. */
const backupTool = config.backupEnabled ? spawnSync('pg_dump', ['--version'], { encoding: 'utf8' }) : null;
if (backupTool?.error) {
  warnings.push('Backups are on but pg_dump is not installed, so only the uploaded files will be saved. On Debian: apt-get install postgresql-client');
}

if (!config.databaseUrl) errors.push('DATABASE_URL is missing.');
if (config.isProduction && !config.appUrl.startsWith('https://')) errors.push('APP_URL must use HTTPS in production.');
if (config.isProduction && !config.encryptionKey) errors.push('APP_ENCRYPTION_KEY is required in production.');
if (!config.anthropicApiKey) warnings.push('ANTHROPIC_API_KEY is not set. Feedback drafting needs it. It can be configured later in the administrator screen.');
if (!config.openaiApiKey) warnings.push('OPENAI_API_KEY is not set. Dictation needs it. It can be configured later in the administrator screen.');
if (config.emailProvider === 'smtp' && (!config.smtp.host || !config.smtp.user || !config.smtp.password)) warnings.push('SMTP is selected but is not fully configured.');
if (config.emailProvider === 'ghl_webhook' && !config.ghlEmailWebhookUrl) warnings.push('GHL webhook delivery is selected but no webhook URL is configured.');

/* The rest are launch-day mistakes: settings that are individually valid but
   wrong together, and only show themselves once real students are affected. */
if (config.isProduction) {
  if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) {
    errors.push('APP_ENCRYPTION_KEY must be 64 hexadecimal characters. Generate one with: npm run generate-key');
  }
  if (/^https:\/\/(localhost|127\.0\.0\.1)/.test(config.appUrl)) {
    errors.push('APP_URL still points at localhost. Students receive this address in their invitation email.');
  }

  const domain = (process.env.APP_DOMAIN || '').trim();
  if (!domain) {
    warnings.push('APP_DOMAIN is not set. docker-compose.prod.yml needs it to get a certificate.');
  } else if (domain !== new URL(config.appUrl).host) {
    errors.push(`APP_DOMAIN (${domain}) and APP_URL (${new URL(config.appUrl).host}) name different hosts. The certificate would be issued for an address nobody visits.`);
  }

  const dbPassword = process.env.POSTGRES_PASSWORD || '';
  if (dbPassword === 'postgres') warnings.push('POSTGRES_PASSWORD is still the default. Change it before the database is reachable from anywhere but Docker.');

  if (config.emailProvider === 'console') {
    warnings.push('EMAIL_PROVIDER is console, so no email actually sends. Invitations, password resets and deadline reminders will only appear in the logs.');
  }
  if (config.uploadDir === config.privateUploadDir) {
    errors.push('UPLOAD_DIR and PRIVATE_UPLOAD_DIR are the same directory. Student work would be served publicly.');
  }
}

if (warnings.length) {
  console.warn('Warnings:');
  warnings.forEach((message) => console.warn(`- ${message}`));
}
if (errors.length) {
  console.error('Preflight failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
if (config.backupEnabled && !backupTool?.error) {
  const version = String(backupTool.stdout).trim();
  console.log(`Backups on: ${version} → ${config.backupDir}, keeping ${config.backupKeepDays} days.`);
}
console.log('Preflight configuration check passed.');
