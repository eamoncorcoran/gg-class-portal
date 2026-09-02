import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateStrongPassword, passwordProblems, hashPassword, verifyPassword, hashToken, safeEqual } from '../src/security.js';

test('generated temporary passwords meet the policy', () => {
  for (let i = 0; i < 25; i += 1) {
    const password = generateStrongPassword();
    assert.equal(passwordProblems(password).length, 0);
    assert.ok(password.length >= 16);
  }
});

test('tokens hash deterministically and safe comparison works', () => {
  assert.equal(hashToken('same'), hashToken('same'));
  assert.notEqual(hashToken('same'), hashToken('different'));
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
});

test('password hashes verify and reject incorrect passwords', async () => {
  const hash = await hashPassword('StrongPassword!123');
  assert.equal(await verifyPassword(hash, 'StrongPassword!123'), true);
  assert.equal(await verifyPassword(hash, 'wrong-password'), false);
});

/* A deploy has to actually reach people.
   ------------------------------------------------------------------
   The page asked for a bare /app.js and everything was cached for an hour, so
   for an hour after every deploy people kept running the previous JavaScript. A
   fix would go out, the person who asked for it would look, and nothing would
   have changed — which is indistinguishable from the fix not working. Worse, a
   browser could hold new HTML against old JavaScript, a pairing nobody has
   tested. */
test('the assets are versioned and the page naming them is never cached', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /ASSET_VERSION/, 'the asset address must change when the version does');
  assert.match(server, /\?v=\$\{ASSET_VERSION\}/, 'the version belongs in the asset URL');
  assert.match(server, /app\\\.js\|styles\\\.css/, 'both the script and the stylesheet need it');

  /* The page must never be held, or a browser keeps asking for the old version
     of the assets and the versioning achieves nothing. */
  const catchAll = server.slice(server.indexOf("app.get('/{*splat}'"));
  assert.match(catchAll, /Cache-Control', 'no-cache'/,
    'the page that names the assets must not be cached');
});

test('the page still references the assets it is meant to version', () => {
  // If index.html ever renames these, the replacement silently stops matching
  // and the caching problem comes back without anything failing.
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /"\/app\.js"/, 'index.html no longer asks for /app.js by that name');
  assert.match(html, /"\/styles\.css"/, 'index.html no longer asks for /styles.css by that name');
});

/* The chat widget, and the price of it.
   ------------------------------------------------------------------
   A third-party script can read whatever is on the page it runs on, so this one
   is loaded on the single screen that shows nothing — no submissions, no
   feedback, no name but the reader's own — and taken away again when that screen
   closes. These hold that arrangement in place. */
test('the chat widget is loaded on one screen and removed from the rest', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(app, /function mountChatWidget\(/);
  assert.match(app, /function unmountChatWidget\(/);
  assert.match(app, /if \(state\.view === 'private'\) \{\s*\n\s*mountChatWidget\(\);/,
    'it must mount only on the private message screen');
  assert.match(app, /\} else \{\s*\n\s*unmountChatWidget\(\);/,
    'and be removed on every other screen');

  /* The loader draws its bubble outside our markup, so removing the script
     alone would leave it floating over the rest of the portal. */
  const unmount = app.slice(app.indexOf('function unmountChatWidget('),
    app.indexOf('function unmountChatWidget(') + 600);
  assert.match(unmount, /chat-widget/, 'the bubble it draws has to go too');
});

test('the policy allows the widget exactly what it needs and no more', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const csp = server.slice(server.indexOf('directives: {'), server.indexOf('frameAncestors') + 60);

  // What the widget actually pulls in, discovered by watching it fail.
  for (const origin of ['leadconnectorhq.com', 'challenges.cloudflare.com', 'msgsndr.com']) {
    assert.ok(csp.includes(origin), `${origin} is missing and the widget will not work`);
  }

  /* The line that must not move. Inline styles are the one loosening this
     widget cost; inline script is the attack that matters and stays blocked. */
  const scriptSrc = csp.slice(csp.indexOf('scriptSrc:'), csp.indexOf('\n', csp.indexOf('scriptSrc:') + 40));
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/,
    'no widget is worth allowing inline script');
  assert.match(csp, /frameAncestors|frame-ancestors/, 'framing must still be refused');
});
