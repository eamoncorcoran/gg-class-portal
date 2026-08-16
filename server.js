import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './src/config.js';
import { pool, one } from './src/db.js';
import { loadSession } from './src/session.js';
import { sameOrigin, errorHandler } from './src/middleware.js';
import authRoutes from './src/routes/auth.js';
import adminRoutes from './src/routes/admin.js';
import studentRoutes from './src/routes/student.js';
import settingsRoutes from './src/routes/settings.js';
import mediaRoutes from './src/routes/media.js';
import calendarRoutes from './src/routes/calendar.js';
import { ensureAllWeeks } from './src/weeks.js';
import { startReminderScheduler, runReminderCycle } from './src/reminders.js';
import { startBackupScheduler } from './src/backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

if (config.isProduction) app.set('trust proxy', 1);
await fs.mkdir(config.uploadDir, { recursive: true });
await fs.mkdir(config.privateUploadDir, { recursive: true });

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      // The interface sets a handful of computed style attributes (progress bar
      // widths, embed sizing). Without this they are silently dropped and the
      // affected controls render collapsed or uncoloured. Stylesheets and
      // <style> blocks stay restricted to same-origin by styleSrc above.
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.loom.com', 'https://loom.com'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());
app.use(loadSession);
app.use('/uploads', express.static(config.uploadDir, {
  fallthrough: false,
  maxAge: config.isProduction ? '7d' : 0,
  setHeaders(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const extension = path.extname(filePath).toLowerCase();
    const inline = new Set(['.png','.jpg','.jpeg','.webp','.gif','.pdf']).has(extension);
    res.setHeader('Content-Disposition', inline ? 'inline' : 'attachment');
  },
}));
app.use(sameOrigin);

const appVersion = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8')).version;

app.get('/api/health', async (_req, res) => {
  try {
    await one('SELECT 1 ok');
    res.json({ ok: true, database: true, version: appVersion });
  } catch {
    res.status(503).json({ ok: false, database: false });
  }
});
app.post('/api/admin/reminders/run', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
    await runReminderCycle();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/media', mediaRoutes);
// Calendar apps subscribe with no cookies, so this one authenticates by URL token.
app.use('/calendar', calendarRoutes);

// An unmatched /api path must not fall through to the app shell, otherwise the
// browser receives HTML where it expects JSON and reports a parsing error.
app.use('/api/{*splat}', (_req, res) => res.status(404).json({ error: 'Not found.' }));

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { maxAge: config.isProduction ? '1h' : 0 }));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use(errorHandler);

async function start() {
  await pool.query('SELECT 1');
  await ensureAllWeeks();
  startReminderScheduler();
  startBackupScheduler();
  app.listen(config.port, () => {
    console.log(`Gaeilgeoir Guides Student Support running at ${config.appUrl}`);
  });
}

start().catch((error) => {
  console.error('Application startup failed', error);
  process.exit(1);
});

export default app;
