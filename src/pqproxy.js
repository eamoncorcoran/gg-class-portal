/**
 * The past-questions service, reached through the hub.
 *
 * The React front end asks one origin for everything, and the papers, question
 * crops, recordings and the marking API come from a separate Python service
 * (deployed on its own, on Render's private network). Everything it serves is
 * passed straight through here: the request body streams up, the response
 * streams back, and Range requests for audio come back as the 206 the browser
 * asked for. Nothing is buffered, nothing is re-encoded, and no sign-in is
 * added or removed on the way.
 *
 * Mounted ahead of the body parsers (the body has to still be a stream) and
 * ahead of the hub's own /api routes (four of its paths live under /api).
 */
import http from 'node:http';
import https from 'node:https';
import { sameOrigin } from './middleware.js';

export const PQ_EXACT = new Set([
  '/data.json', '/keys.json', '/resources.json', '/papers.json', '/lessons.json',
  '/grammar.json', '/oral.json', '/subjects.json',
  '/api/check', '/api/grade', '/api/tutor', '/api/speak',
]);
export const PQ_PREFIXES = ['/papers/', '/oral/sp/', '/crops/', '/aud/', '/audio/', '/subjects/'];

export function isPastQuestionsPath(pathname) {
  return PQ_EXACT.has(pathname) || PQ_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/* Hop-by-hop headers belong to one connection and must not be copied to the next. */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

export function pastQuestionsProxy() {
  const base = String(process.env.PQ_SERVICE_URL || '').trim().replace(/\/$/, '');
  let target = null;
  if (base) {
    try { target = new URL(base); } catch { console.error(`PQ_SERVICE_URL is not a URL: ${base}`); }
  }
  const agent = target
    ? new (target.protocol === 'https:' ? https.Agent : http.Agent)({ keepAlive: true, maxSockets: 64 })
    : null;

  return function pqProxy(req, res, next) {
    const pathname = req.originalUrl.split('?')[0];
    if (!isPastQuestionsPath(pathname)) return next();
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (!target) {
      return res.status(503).json({ error: 'The past questions service is not configured (PQ_SERVICE_URL).' });
    }
    // Same rule as every other write on this origin: a POST here spends API
    // credit, so it only comes from this site.
    if (req.method === 'POST') {
      let allowed = false;
      sameOrigin(req, res, () => { allowed = true; });
      if (!allowed) return undefined; // sameOrigin has already answered 403
    }

    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (HOP_BY_HOP.has(name) || name === 'cookie') continue;
      headers[name] = value;
    }
    headers.host = target.host;
    headers['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
    headers['x-forwarded-proto'] = req.protocol;
    headers['x-forwarded-host'] = req.get('host') || '';

    const client = target.protocol === 'https:' ? https : http;
    const upstream = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: target.pathname.replace(/\/$/, '') + req.originalUrl,
      headers,
      agent,
    }, (response) => {
      const out = {};
      for (const [name, value] of Object.entries(response.headers)) {
        if (HOP_BY_HOP.has(name)) continue;
        out[name] = value;
      }
      res.writeHead(response.statusCode || 502, out);
      response.pipe(res);
      response.on('error', () => res.destroy());
    });
    upstream.on('error', (error) => {
      console.error('past questions proxy failed', error?.message);
      if (!res.headersSent) res.status(502).json({ error: 'The past questions service is not reachable.' });
      else res.destroy();
    });
    // A browser that gives up mid-download should not leave the upstream streaming into nothing.
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
    return undefined;
  };
}
