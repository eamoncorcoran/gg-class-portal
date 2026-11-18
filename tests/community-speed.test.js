import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The board felt choppy.
   ------------------------------------------------------------------
   Opening a post changes the address to /community/<post>. The page was keyed
   on its address, so every open and every close threw the whole board away,
   read it again from the server, faded it back in and sent the page to the top.
   The board is one page whatever post is open over it, and what it last showed
   is kept so it is drawn at once. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const parts = read('../web/src/components/app/page-parts.tsx');
const page = read('../web/src/pages/community-page.tsx');

test('a post opened over the board is the same page, so nothing is rebuilt or scrolled', () => {
  assert.match(parts, /if \(pathname === "\/community" \|\| pathname\.startsWith\("\/community\/"\)\) return "\/community";/);
  assert.match(parts, /if \(pathname === "\/teach\/messages" \|\| pathname\.startsWith\("\/teach\/messages\/"\)\) return "\/teach\/messages";/);
  assert.match(parts, /key=\{pageKey\(pathname\)\}/);
  const main = read('../web/src/main.tsx');
  assert.match(main, /const samePage = pageKey\(prev\.current\) === pageKey\(pathname\);/);
  assert.match(main, /if \(samePage\) return;/);
});

test('the board is drawn from what it last showed, then replaced by the fresh copy', () => {
  assert.match(page, /const seen = boardUrl \? boards\.get\(boardUrl\) : undefined;\s+if \(seen\) setBoardState\(seen\);/);
  assert.match(page, /boards\.set\(boardUrl, b\);/);
  // A slow answer for a filter that has since been changed is not drawn over the new one.
  assert.match(page, /if \(wanted\.current !== boardUrl\) return;/);
});

test('a post opens showing what the feed already holds, and its comments follow', () => {
  assert.match(page, /const \[t, setT\] = useState<FullThread \| null>\(kept \?\? \(seed \? \{ \.\.\.seed, comments: \[\] \} : null\)\);/);
  assert.match(page, /seed=\{all\.find\(\(x\) => x\.id === openId\)\}/);
  assert.match(page, /"Loading the comments…"/);
  // Hovering or touching a post starts reading it.
  assert.match(page, /onPointerEnter=\{\(\) => prefetchThread\(base, t\.id\)\}/);
  assert.match(page, /onTouchStart=\{\(\) => prefetchThread\(base, t\.id\)\}/);
});

test('after something is written, the post is read afresh rather than from an answer already on its way', () => {
  assert.match(page, /let going = fresh \? undefined : threadFetches\.get\(key\);/);
  assert.match(page, /fetchThread\(base, id, !first\.current\)/);
});

test('the menu warms the board before Community is opened', () => {
  const side = read('../web/src/components/app/app-sidebar.tsx');
  assert.match(side, /onNear=\{\(\) => me && warmBoard\(me\.role\)\}/);
  const cache = read('../web/src/lib/community-cache.ts');
  assert.match(cache, /if \(!url \|\| boardCache\.has\(url\) \|\| going\.has\(url\)\) return;/);
});
