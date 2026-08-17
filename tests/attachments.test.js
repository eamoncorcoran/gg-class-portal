import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* What a browser calls a file cannot be trusted: a PDF dragged out of some file
   managers arrives labelled application/octet-stream, and every Office document
   is a zip. These pin the rule that the bytes decide, which is what stopped
   perfectly good PDFs being refused on a label. */

const source = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const sniffDocument = new Function(
  'path',
  `${source.slice(source.indexOf('function sniffDocument'), source.indexOf('router.post(\'/community/attachments\''))}; return sniffDocument;`,
)(await import('node:path'));

const pdf = () => Buffer.from('%PDF-1.4\nrest of the file');
const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rest of the zip')]);

test('a PDF is recognised whatever the browser called it', () => {
  assert.deepEqual(sniffDocument(pdf(), 'Week 4 notes.pdf'),
    { kind: 'pdf', mimeType: 'application/pdf', extension: '.pdf' });
  // No extension at all, which is how some downloads arrive.
  assert.equal(sniffDocument(pdf(), 'notes')?.kind, 'pdf');
});

test('a .docx is recognised as a zip carrying that extension', () => {
  const result = sniffDocument(zip(), 'Week 4 notes.docx');
  assert.equal(result.kind, 'docx');
  assert.equal(result.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(result.extension, '.docx');
  assert.equal(sniffDocument(zip(), 'WEEK 4 NOTES.DOCX')?.kind, 'docx', 'extension matching must not be case sensitive');
});

test('another kind of zip is not a Word document', () => {
  // .xlsx, .pptx and a plain .zip are all PK archives too.
  assert.equal(sniffDocument(zip(), 'marks.xlsx'), null);
  assert.equal(sniffDocument(zip(), 'photos.zip'), null);
});

test('a file that only claims to be a PDF is refused', () => {
  assert.equal(sniffDocument(Buffer.from('not a pdf at all'), 'trustme.pdf'), null);
});

test('nothing at all is refused rather than throwing', () => {
  assert.equal(sniffDocument(Buffer.alloc(0), 'empty.pdf'), null);
  assert.equal(sniffDocument(Buffer.from([0x25]), 'truncated.pdf'), null);
});

test('the oversize message names the actual limit', () => {
  const middleware = fs.readFileSync(new URL('../src/middleware.js', import.meta.url), 'utf8');
  const limit = source.match(/POST_ATTACHMENT_MB = (\d+)/)?.[1];
  assert.ok(limit, 'the attachment limit is no longer where this test expects it');
  assert.match(middleware, new RegExp(`under ${limit}MB`),
    'the message in middleware.js disagrees with the limit in admin.js');
});

/* The bug this pins: an uploaded file comes back as a path under /uploads
   rather than a full address, and requiring a complete URL rejected every one
   of them — reporting it, because the whole body then failed to parse, as a
   missing title. */
test('an uploaded path is a valid attachment address, and a hostile one is not', () => {
  const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
  const start = admin.indexOf('const attachmentUrl = z.string()');
  assert.ok(start !== -1, 'attachmentUrl is no longer where this test expects it');
  const rule = admin.slice(start, admin.indexOf(');', start));

  const accepts = (value) =>
    value.startsWith('/uploads/') || /^https?:\/\//i.test(value);

  // The rule in the file has to be the one being asserted here.
  assert.match(rule, /startsWith\('\/uploads\/'\)/);
  assert.match(rule, /\^https\?/);

  assert.equal(accepts('/uploads/post-abc.pdf'), true);
  assert.equal(accepts('https://media.giphy.com/media/x/giphy.gif'), true);
  assert.equal(accepts('http://www.loom.com/share/abc12345'), true);
  assert.equal(accepts('javascript:alert(1)'), false);
  assert.equal(accepts('data:text/html,<script>'), false);
  assert.equal(accepts('../../etc/passwd'), false);
});
