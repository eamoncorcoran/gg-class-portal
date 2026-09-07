import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VIDEO_PROVIDERS, PROVIDER_LABELS, parseVideoSource, videoSource } from '../src/lessonvideo.js';

/* A Zoom recording as a lesson.
   ------------------------------------------------------------------
   Every other host here supplies a player that can be embedded. Zoom does not:
   its recording page asks for a passcode and offers to open the Zoom app, and
   neither works inside a frame on another site. Embedding one produces a blank
   rectangle with nothing to say why — which is the failure this whole app keeps
   having, so it is worth being explicit that this one is a link. */

test('Zoom is one of the hosts a lesson can use', () => {
  assert.ok(VIDEO_PROVIDERS.includes('zoom'));
  assert.equal(PROVIDER_LABELS.zoom, 'Zoom recording');
});

test('a Zoom link is kept whole, because there is no id to take out of it', () => {
  const url = 'https://us02web.zoom.us/rec/share/abc123XYZ?pwd=xyz';
  assert.deepEqual(parseVideoSource('zoom', url), { provider: 'zoom', ref: url });
});

/* This string goes into an href. javascript: in an href is not a link, it is a
   script the student runs by clicking it. */
test('what is not a web address is refused', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'not a url', '', null]) {
    assert.equal(parseVideoSource('zoom', bad), null, `${JSON.stringify(bad)} must not be stored`);
  }
});

test('a Zoom lesson is rendered as a link rather than a player', () => {
  const source = videoSource({
    video_provider: 'zoom', video_ref: 'https://us02web.zoom.us/rec/share/abc', video_passcode: '8Xk?2wQz',
  });
  assert.equal(source.type, 'link', 'an iframe of a Zoom recording is a blank box');
  assert.equal(source.src, 'https://us02web.zoom.us/rec/share/abc');
  assert.equal(source.passcode, '8Xk?2wQz', 'the passcode has to travel with it');
});

test('the other hosts still play in the page', () => {
  assert.equal(videoSource({ video_provider: 'youtube', video_ref: 'abc123' }).type, 'iframe');
  assert.equal(videoSource({ video_provider: 'loom', video_ref: 'abcdefgh12' }).type, 'iframe');
});

/* The list of hosts is enforced in the database as well as in the code. Adding
   one to VIDEO_PROVIDERS without adding it to the constraint means every lesson
   using it is refused on save — which is exactly what happened the first time
   this was written, and the error named a constraint rather than a cause. */
test('the database accepts every host the code offers', () => {
  const migrations = fs.readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => fs.readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
    .join('\n');
  const checks = [...migrations.matchAll(/course_lessons_video_provider_check[\s\S]*?CHECK \(([^;]+)\)/g)];
  assert.ok(checks.length, 'the provider constraint should be findable in the migrations');
  const latest = checks[checks.length - 1][1];
  for (const provider of VIDEO_PROVIDERS) {
    assert.ok(latest.includes(`'${provider}'`),
      `the database constraint does not allow '${provider}', so saving one would fail`);
  }
});

test('the passcode is kept when a lesson is edited for something else', () => {
  const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
  assert.match(admin, /data\.videoPasscode === undefined \? current\.video_passcode : \(data\.videoPasscode \|\| null\)/,
    'renaming a lesson must not silently drop its passcode');
});

test('the student is given the passcode, not only the link', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const player = app.slice(app.indexOf('function lessonPlayer('));
  const body = player.slice(0, player.indexOf('\n}\n'));
  assert.match(body, /lesson\.video\.passcode/, 'the player must show the passcode');
  assert.match(body, /target="_blank" rel="noopener noreferrer"/,
    'and open Zoom without handing it a reference to this page');
});
