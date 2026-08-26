import { config } from './config.js';

/* Which addresses this portal answers writes on.
   ------------------------------------------------------------------
   APP_URL is the address students are given, and for most of the life of a
   deployment it is the only one. But a hosted portal always has a second, real
   address of its own — the one the platform assigns — and it stays reachable
   whether or not the custom domain is working. It is the address you use before
   DNS has been set up, and the one you fall back to the day a DNS change goes
   wrong.

   Both are supplied by the server: APP_URL from configuration, and
   RENDER_EXTERNAL_URL by the platform itself. Neither can be influenced by
   whoever is making the request, which is what keeps this a real check rather
   than a formality. */
function allowedOrigins() {
  const candidates = [
    config.appUrl,
    process.env.RENDER_EXTERNAL_URL,
    ...String(process.env.ALT_ORIGINS || '').split(',').map((entry) => entry.trim()),
  ];
  const origins = new Set();
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { origins.add(new URL(candidate).origin); } catch { /* ignore an unusable entry */ }
  }
  return origins;
}

export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (!allowedOrigins().has(new URL(origin).origin)) {
      return res.status(403).json({ error: 'Cross-origin request blocked.' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  return next();
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/* Multer's own errors carry a code rather than a status, so without this an
   oversized file reads to the person uploading it as "Something went wrong"
   — which tells them nothing and invites them to try the same file again. */
const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: 'That file is too large. Try one under 40MB.',
  LIMIT_FILE_COUNT: 'Too many files at once.',
  LIMIT_UNEXPECTED_FILE: 'That file was sent to the wrong place.',
};

export function errorHandler(error, req, res, _next) {
  console.error(error);
  if (res.headersSent) return;
  if (UPLOAD_ERRORS[error.code]) {
    return res.status(413).json({ error: UPLOAD_ERRORS[error.code] });
  }
  const status = error.status || error.statusCode || 500;
  res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : error.message });
}
