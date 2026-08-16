import 'dotenv/config';
import path from 'node:path';

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: integer(process.env.PORT, 3000),
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/gaeilgeoir_support',
  databaseSsl: bool(process.env.DATABASE_SSL, false),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'gg_session',
  sessionDays: integer(process.env.SESSION_DAYS, 90),
  encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  /* Student work and teacher voice notes never go in uploadDir, because that
     directory is served publicly for assignment resources. They live here and
     are only ever reached through the authenticated media routes. */
  privateUploadDir: path.resolve(process.env.PRIVATE_UPLOAD_DIR || './uploads-private'),
  maxUploadMb: integer(process.env.MAX_UPLOAD_MB, 20),
  emailProvider: process.env.EMAIL_PROVIDER || 'console',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Gaeilgeoir Guides',
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'support@gaeilgeoirguides.com',
  emailReplyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM_ADDRESS || 'support@gaeilgeoirguides.com',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: integer(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
  },
  ghlEmailWebhookUrl: process.env.GHL_EMAIL_WEBHOOK_URL || '',
  reminderCron: process.env.REMINDER_CRON || '*/5 * * * *',
  /* On by default in production: a backup nobody remembered to switch on is the
     one you find out about the night you need it. */
  backupEnabled: bool(process.env.BACKUP_ENABLED, (process.env.NODE_ENV || 'development') === 'production'),
  backupCron: process.env.BACKUP_CRON || '15 3 * * *',
  backupDir: path.resolve(process.env.BACKUP_DIR || './backups'),
  backupKeepDays: integer(process.env.BACKUP_KEEP_DAYS, 14),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Europe/Dublin',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
});
