import { config } from './config.js';

export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (new URL(origin).origin !== new URL(config.appUrl).origin) {
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
