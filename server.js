import fs from 'node:fs/promises';
import path from 'node:path';
import fsSync from 'node:fs';
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
import zoomHookRoutes from './src/routes/zoomhook.js';
import { ensureAllWeeks } from './src/weeks.js';
import { startReminderScheduler, runReminderCycle } from './src/reminders.js';
import { startBackupScheduler } from './src/backup.js';
import { startZoomScheduler } from './src/zoomscheduler.js';

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
      /* The chat widget on the Private message screen, and nothing else from
         outside. A third-party script can read whatever is on the page it runs
         on, which is why it is loaded on that one screen — the only screen in
         the portal that shows no student work, no feedback and no names but the
         reader's own. The session cookie is httpOnly, so it is out of reach of
         any script regardless. */
      /* The widget pulls in more than its own domain: Cloudflare Turnstile,
         which is the check the contact form renders behind, and GoHighLevel's
         session service. Without Turnstile the panel opens empty, which looks
         like the widget being broken rather than being blocked. */
      scriptSrc: ["'self'", 'https://*.leadconnectorhq.com', 'https://challenges.cloudflare.com'],
      /* The chat widget writes its own styles inline and pulls a font from
         bunny.net. Allowing inline styles is a genuine loosening — it is the one
         directive this widget costs us — but script injection, which is the
         attack that matters, stays blocked by scriptSrc above. */
      styleSrc: ["'self'", "'unsafe-inline'", 'https://*.leadconnectorhq.com', 'https://fonts.bunny.net'],
      // The interface sets a handful of computed style attributes (progress bar
      // widths, embed sizing). Without this they are silently dropped and the
      // affected controls render collapsed or uncoloured. Stylesheets and
      // <style> blocks stay restricted to same-origin by styleSrc above.
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:', 'https://fonts.bunny.net', 'https://*.leadconnectorhq.com'],
      connectSrc: ["'self'", 'https://*.leadconnectorhq.com', 'wss://*.leadconnectorhq.com',
        'https://*.msgsndr.com'],
      // Video players only. nocookie for YouTube so a class board is not
      // setting advertising cookies on students.
      frameSrc: ["'self'", 'https://www.loom.com', 'https://loom.com',
        'https://www.youtube-nocookie.com', 'https://www.youtube.com',
        'https://*.leadconnectorhq.com', 'https://challenges.cloudflare.com'],
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
/* Ahead of the JSON parser: verifying Zoom's signature needs the bytes they
   actually sent, and a re-serialised object is not those bytes. */
app.use('/api/zoom/webhook', zoomHookRoutes);
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
/* Assets are cached hard, and the page that names them is not.
   ------------------------------------------------------------------
   These were both cached for an hour, and index.html asked for a bare /app.js.
   So for an hour after every deploy people kept running the previous
   JavaScript: a fix would go out, the person who asked for it would look, and
   nothing would have changed. Worse, a browser could hold new HTML against old
   JavaScript, which is a combination nobody has ever tested.

   The version goes in the query string, so a deploy changes the address and the
   browser has no cached copy to reach for. That makes the long cache on the
   assets safe rather than dangerous — the only thing that must always be fresh
   is the small page that names them. */
const ASSET_VERSION = process.env.npm_package_version || String(Date.now());

app.use(express.static(publicDir, {
  maxAge: config.isProduction ? '1h' : 0,
  // The page itself is served below, not from here.
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

const indexHtml = () => fsSync.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  .replace(/(["'])(\/(?:app\.js|styles\.css))\1/g, `$1$2?v=${ASSET_VERSION}$1`);

/* Read once in production, where the file cannot change under a running
   container, and every time in development so an edit shows up on reload. */
let cachedIndex = null;
app.get('/{*splat}', (_req, res) => {
  if (!cachedIndex || !config.isProduction) cachedIndex = indexHtml();
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(cachedIndex);
});

app.use(errorHandler);

async function start() {
  await pool.query('SELECT 1');
  await ensureAllWeeks();
  startReminderScheduler();
  startBackupScheduler();
  startZoomScheduler();
  app.listen(config.port, () => {
    console.log(`Gaeilgeoir Guides Student Support running at ${config.appUrl}`);
  });
}

start().catch((error) => {
  console.error('Application startup failed', error);
  process.exit(1);
});

export default app;
