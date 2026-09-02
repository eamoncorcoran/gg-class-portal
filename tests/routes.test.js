import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Every address the browser asks for must exist on the server.
   ------------------------------------------------------------------
   Nothing connects these two halves. The client composes a URL as a string and
   the server registers one separately, so a route that was never written fails
   only when somebody presses the button — and then usually says nothing at all.
   That is how the board's suggested reply, the category manager and the
   run-reminders button all came to be wired to nothing. Each looked finished.

   Matched segment by segment, because a route parameter answers whatever sits in
   that position: `/voice-note/:type/:id` is what serves
   `/voice-note/comment/abc`, and comparing the two strings would say otherwise. */

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const MOUNTS = {
  'admin.js': '/api/admin', 'student.js': '/api/student', 'auth.js': '/api/auth',
  'settings.js': '/api/settings', 'media.js': '/api/media', 'zoom.js': '/api/zoom',
};

/** Path segments, with any query string dropped. */
function segments(path) {
  return path.split('?')[0].replace(/^\/+|\/+$/g, '').split('/');
}

function definedRoutes() {
  const dir = new URL('../src/routes/', import.meta.url);
  const routes = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(new URL(file, dir), 'utf8');
    const mount = MOUNTS[file] ?? '';
    for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      const path = match[2] === '/' ? '' : match[2];
      routes.push({ method: match[1].toUpperCase(), segments: segments(`${mount}${path}`) });
    }
  }
  return routes;
}

function clientCalls() {
  const calls = [];
  const seen = new Set();

  /* A path can begin with an interpolation rather than a literal, because which
     half of the API to address is sometimes a runtime decision: the board is one
     screen for two kinds of person and `boardApi()` resolves to /api/student or
     /api/admin by role. Dropping those calls — which is what happened here —
     made the audit blind to exactly the endpoints most likely to exist on only
     one side. Commenting on the board was missing from the teacher's half for
     that entire time and nothing said so.

     Such a call is checked against every mount it could resolve to, and has to
     exist under all of them. That is the real requirement: if the helper can
     return either mount, either can be called. */
  const ROLE_MOUNTS = ['/api/admin', '/api/student'];

  const add = (raw, method) => {
    if (raw.startsWith('${')) {
      const rest = raw.slice(raw.indexOf('}') + 1);
      if (rest.startsWith('/')) for (const mount of ROLE_MOUNTS) add(`${mount}${rest}`, method);
      return;
    }
    if (!raw.startsWith('/api/')) return;
    /* An interpolation can carry a query string of its own — `${query}` holding
       "?classId=…" — so anything after the first one that is not a clean whole
       segment cannot be read. The path is cut there and only the readable part
       is checked.

       "Clean whole segment" means it fills a slot between slashes: preceded by a
       slash, and followed by a slash or nothing. `/threads/${id}` is readable and
       `${id}` is simply a parameter; `${classId}${suffix}` is not, because
       suffix may be a query string.

       The distinction matters more than it looks. Treating a trailing `${id}` as
       unreadable cut the path short and dropped the check to a prefix match,
       which will accept any longer route that happens to start the same way —
       and `/community/react/:x/:x` was being answered, on paper, by
       `/community/:classId/threads`. A missing route looked present. */
    const cut = raw.search(/\$\{[^}]*\}/) === -1 ? -1 : (() => {
      const pattern = /\$\{[^}]*\}/g;
      let match;
      while ((match = pattern.exec(raw)) !== null) {
        const before = match.index === 0 ? '' : raw[match.index - 1];
        const afterIndex = match.index + match[0].length;
        const after = afterIndex >= raw.length ? '' : raw[afterIndex];
        const wholeSegment = before === '/' && (after === '' || after === '/');
        if (!wholeSegment) return match.index;
      }
      return -1;
    })();
    const usable = (cut === -1 ? raw : raw.slice(0, cut)).replace(/\/$/, '');
    let path = usable.replace(/\$\{[^}]*\}/g, ':x');
    /* An interpolation containing its own braces defeats the pattern above and
       leaves a `${` behind. Whatever follows is unreadable, so it is cut and the
       call is checked as a prefix rather than guessed at. */
    let partial = cut !== -1;
    const unresolved = path.indexOf('${');
    if (unresolved !== -1) {
      path = path.slice(0, unresolved).replace(/\/$/, '');
      partial = true;
    }
    if (!path.startsWith('/api/')) return;
    const shown = `${method || 'GET'} ${path}`;
    if (seen.has(shown)) return;
    seen.add(shown);
    calls.push({ method: method || 'GET', segments: segments(path), shown, partial });
  };

  for (const match of app.matchAll(/api\(\s*`([^`]+)`\s*(?:,\s*\{[^{}]*method:\s*'(\w+)')?/g)) {
    add(match[1], match[2]);
  }
  for (const match of app.matchAll(/api\(\s*'([^']+)'\s*(?:,\s*\{[^{}]*method:\s*'(\w+)')?/g)) {
    add(match[1], match[2]);
  }
  return calls;
}

/**
 * A parameter segment answers anything in that position — on either side.
 *
 * On the route side because that is what a route parameter is. On the call side
 * because an interpolated value can itself be a fixed path segment: the redraft
 * button builds `/${type}/${id}/redraft` where type is literally "checkins" or
 * "homework", and there is no way to read that out of the source.
 */
function matches(callSegments, routeSegments, exact = true) {
  if (exact && callSegments.length !== routeSegments.length) return false;
  if (!exact && routeSegments.length < callSegments.length) return false;
  return callSegments.every((segment, index) => segment === ':x'
    || routeSegments[index].startsWith(':')
    || routeSegments[index] === segment);
}

test('every API call the interface makes has a route behind it', () => {
  const defined = definedRoutes();
  const missing = clientCalls()
    .filter((call) => !defined.some((route) => route.method === call.method
      // A call whose path had to be cut short is checked as a prefix: it is
      // still worth knowing when nothing serves that shape at all.
      && matches(call.segments, route.segments, !call.partial)))
    .map((call) => call.shown);

  assert.deepEqual(missing, [],
    `the interface calls these, and nothing answers:\n  ${missing.join('\n  ')}`);
});

/* One screen, two kinds of person, and the routes have to exist for both.
   ------------------------------------------------------------------
   The board is drawn once and `boardApi()` decides at run time whether it is
   talking to /api/student or /api/admin. That makes every endpoint it touches a
   pair, and a pair is easy to write only half of: replying and reacting existed
   for students and not for teachers, so the one person expected to answer on the
   board got Not found when they tried. This names the requirement rather than
   leaving it to be inferred from the audit above. */
test('everything the shared board calls exists for students and teachers alike', () => {
  const defined = definedRoutes();
  const shared = clientCalls().filter((call) => call.segments[1] === 'admin' || call.segments[1] === 'student');

  const board = shared.filter((call) => call.segments[2] === 'community');
  assert.ok(board.length >= 4, 'the board calls should have been found; the scan is broken');

  const missing = board
    .filter((call) => !defined.some((route) => route.method === call.method
      && matches(call.segments, route.segments, !call.partial)))
    .map((call) => call.shown);

  assert.deepEqual(missing, [],
    `the board offers these to somebody who cannot use them:\n  ${missing.join('\n  ')}`);
});

test('the audit is actually looking at something', () => {
  /* A guard on the guard. A regex that quietly stopped matching would make the
     test above pass by finding nothing to check. */
  assert.ok(definedRoutes().length > 100, 'far fewer routes found than exist — the scan is broken');
  assert.ok(clientCalls().length > 80, 'far fewer client calls found than exist — the scan is broken');
});
