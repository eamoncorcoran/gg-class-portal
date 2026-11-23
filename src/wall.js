/**
 * The wall: what somebody who is not signed in may ask this server for.
 *
 * The portal is for the people the teacher has added to it and nobody else.
 * There is no way to register; an account exists because an administrator
 * made it. This file is the other half of that: without a valid session, the
 * only things answered are the ones a person needs in order to sign in, plus a
 * short list of doors that are meant to be open and each carry their own key.
 *
 * It is a deny-by-default list on purpose. Before it, each route decided for
 * itself, and three things had been left open that nobody chose to leave open:
 * the hub's export (class dates, course list and the links to the Zoom
 * recordings), the whole past-questions service, and the uploads folder. A new
 * route added tomorrow is closed unless it is named here.
 */
import { config } from './config.js';
import { sessionUser, sessionTokenFromCookieHeader } from './session.js';
import { isPastQuestionsPath } from './pqproxy.js';
import { studentAccess } from './coursetypes.js';

/* Answered to anybody, exactly these. */
const OPEN_EXACT = new Set([
  '/api/health',        // the host's health check
  '/robots.txt',
  '/favicon.ico',
  '/logo.webp',         // on the sign-in and booking pages
  '/styles.css',        // the booking page and the old interface's sign-in
  '/app.js',            // the old interface's sign-in (code, no content)
  '/mock-oral',         // the mock oral booking page: public by design, name and email, no sign-in
  '/mock-oral.js',
]);

/* Answered to anybody, everything under these. Each has its own key or holds no content. */
const OPEN_PREFIXES = [
  '/api/auth/',             // signing in, signing out, forgotten and reset passwords
  '/api/zoom/webhook',      // Zoom, which signs what it sends
  '/api/mock-oral/public',  // the booking page's own calls
  '/api/pq-pass/',          // the past-questions service checking that a request came from here
  '/calendar/',             // a calendar feed, addressed by its own long secret token
  '/assets/',               // the app's code and styles, needed to draw the sign-in page
  '/icons/',                // the old interface's icons
];

/* A page of the app: a GET for an address with no file extension, outside the
   API. Signed out, every one of them is the same empty shell, which shows the
   sign-in form and nothing else. */
const isPage = (req, path) => (req.method === 'GET' || req.method === 'HEAD')
  && !path.startsWith('/api/')
  && !path.startsWith('/uploads/')
  && !/\.[a-z0-9]{1,8}$/i.test(path);

export function openToAll(req) {
  const path = req.path;
  /* Nothing clever with dots or doubled slashes gets to borrow an open prefix. */
  let plain = path;
  try { plain = decodeURIComponent(path); } catch { return false; }
  if (/\.\.|\/\/|\\/.test(plain)) return false;
  if (OPEN_EXACT.has(path)) return true;
  if (OPEN_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (isPastQuestionsPath(path)) return false;
  return isPage(req, path);
}

/* Is there a live session behind this request's cookie?
   Asked for every question crop and audio file on a page, so the answer is kept
   for a few seconds rather than asked of the database each time. The API routes
   behind the wall still check the session themselves on every call, so this
   short memory only ever covers files. */
const REMEMBER_MS = 20 * 1000;
const seen = new Map();

async function signedIn(req) {
  if (req.user) return req.user;
  const token = req.cookies?.[config.sessionCookieName] || sessionTokenFromCookieHeader(req.headers.cookie);
  if (!token) return null;
  const now = Date.now();
  const hit = seen.get(token);
  if (hit && now - hit.at < REMEMBER_MS) return hit.user;
  const user = await sessionUser(token);
  if (seen.size > 5000) seen.clear();
  seen.set(token, { user, at: now });
  return user;
}

/** Signing out takes effect on files at once, not when the short memory lapses. */
export function forgetSession(token) {
  if (token) seen.delete(token);
}

export function wall(req, res, next) {
  if (openToAll(req)) return next();
  signedIn(req).then(async (user) => {
    if (!user) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({ error: 'Sign in to see this.' });
    }
    /* A student whose only course is on demand (Hibernia) has no past
       questions or papers: the menu does not offer them, and the files are
       closed to them here too. */
    if (user.role === 'student' && isPastQuestionsPath(req.path) && (await studentAccess(user.id)).coursesOnly) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(403).json({ error: 'Past questions are not part of your course.' });
    }
    return next();
  }).catch(next);
  return undefined;
}

/* Search engines.
   ------------------------------------------------------------------
   Every response says noindex, the pages as well as the files. robots.txt does
   not disallow anything, and that is deliberate: a crawler that is forbidden to
   ask never sees the noindex, and a search engine may then list the bare
   address of a page it was told about elsewhere. Allowed to ask, it is told no,
   and all it can fetch is a sign-in form. */
export const ROBOTS_HEADER = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
export function noIndex(_req, res, next) {
  res.setHeader('X-Robots-Tag', ROBOTS_HEADER);
  next();
}
export const ROBOTS_TXT = [
  '# Nothing on this site is for search engines. Every response carries',
  '# "X-Robots-Tag: noindex", which a crawler only sees if it is allowed to ask,',
  '# so nothing is disallowed here. All there is to fetch is a sign-in page.',
  'User-agent: *',
  'Disallow:',
  '',
].join('\n');
