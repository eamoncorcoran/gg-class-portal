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

export function errorHandler(error, req, res, _next) {
  console.error(error);
  if (res.headersSent) return;
  const status = error.status || error.statusCode || 500;
  res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : error.message });
}
