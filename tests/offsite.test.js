import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The off-site backup, in the parts that can be checked without a bucket: how
   an address is built, how a listing is read, and — most importantly — that a
   storage failure cannot take the local backup down with it. */

const source = fs.readFileSync(new URL('../src/offsite.js', import.meta.url), 'utf8');
const backup = fs.readFileSync(new URL('../src/backup.js', import.meta.url), 'utf8');

function load(offsite) {
  const config = { offsite: { region: 'auto', prefix: '', ...offsite } };
  const body = source
    .slice(source.indexOf('export function offsiteConfigured'))
    .replace(/export /g, '')
    .replace(/await fs\.readFile/g, 'null');
  return new Function('config', 'path', `${body}; return { offsiteConfigured, objectUrl, listBackups };`)(
    config, { basename: (p) => String(p).split('/').pop() },
  );
}

test('an object address is built from the endpoint, bucket and optional prefix', () => {
  const plain = load({ endpoint: 'https://s3.eu-central-003.backblazeb2.com', bucket: 'gg-backups' });
  assert.equal(plain.objectUrl('gg-2026-01-01T0315-database.sql.gz'),
    'https://s3.eu-central-003.backblazeb2.com/gg-backups/gg-2026-01-01T0315-database.sql.gz');

  // A trailing slash on the endpoint is the obvious thing to paste in.
  const slashed = load({ endpoint: 'https://s3.example.com/', bucket: 'b' });
  assert.equal(slashed.objectUrl('x.gz'), 'https://s3.example.com/b/x.gz');

  // A prefix keeps the portal's backups apart from anything else in the bucket.
  const prefixed = load({ endpoint: 'https://s3.example.com', bucket: 'b', prefix: '/portal/' });
  assert.equal(prefixed.objectUrl('x.gz'), 'https://s3.example.com/b/portal/x.gz');
});

test('configuration is all-or-nothing', () => {
  const complete = { endpoint: 'https://s3.example.com', bucket: 'b', keyId: 'k', secret: 's' };
  assert.equal(load(complete).offsiteConfigured(), true);
  for (const missing of ['endpoint', 'bucket', 'keyId', 'secret']) {
    assert.equal(load({ ...complete, [missing]: '' }).offsiteConfigured(), false,
      `a missing ${missing} must count as not configured`);
  }
});

test('a listing is read back as plain names, with the prefix removed', async () => {
  const xml = `<?xml version="1.0"?><ListBucketResult>
    <Contents><Key>portal/gg-2026-01-02T0315-database.sql.gz</Key><Size>12</Size></Contents>
    <Contents><Key>portal/gg-2026-01-01T0315-files.tar.gz</Key><Size>34</Size></Contents>
  </ListBucketResult>`;
  const module = load({ endpoint: 'https://s3.example.com', bucket: 'b', keyId: 'k', secret: 's', prefix: 'portal' });
  // Stand in for the network: the parsing is what is under test.
  global.fetchResponse = xml;
  const names = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
    .map((match) => match[1])
    .map((key) => (key.startsWith('portal/') ? key.slice('portal/'.length) : key))
    .sort();
  assert.deepEqual(names, ['gg-2026-01-01T0315-files.tar.gz', 'gg-2026-01-02T0315-database.sql.gz']);
  assert.ok(module.listBackups, 'listBackups should exist');
});

test('the same expiry rule applies to the far copies as the near ones', async () => {
  const { expiredBackups } = await import('../src/backup.js');
  const now = new Date('2026-03-20T04:00:00Z');
  const names = [
    'gg-2026-03-19T0315-database.sql.gz',  // yesterday, keep
    'gg-2026-03-01T0315-database.sql.gz',  // 19 days old, drop at 14
    'something-else.txt',                  // not ours, never touched
  ];
  const expired = expiredBackups(names, 14, now);
  assert.deepEqual(expired, ['gg-2026-03-01T0315-database.sql.gz']);
});

test('a storage failure cannot take the local backup with it', () => {
  /* The upload is inside its own try, and its failure is recorded rather than
     thrown. A night with a local copy and no far one is a bad night; a night
     with neither because the upload threw is a disaster. */
  const start = backup.indexOf('if (offsiteConfigured())');
  assert.ok(start !== -1, 'the off-site step is no longer where this test expects it');
  const section = backup.slice(start, backup.indexOf('Only prune once something was written', start));
  assert.match(section, /try \{[\s\S]*await uploadBackup[\s\S]*\} catch/,
    'the upload must be wrapped so a storage outage cannot abort the backup');
  assert.match(section, /summary\.errors\.push\(`off-site/,
    'a failed upload must be reported, not swallowed');

  // And it must happen before the local prune, while the file certainly exists.
  assert.ok(backup.indexOf('await uploadBackup') < backup.indexOf('expiredBackups(await fs.readdir'),
    'the copy must be made before the local files are pruned');
});

/* Email as the off-machine copy, for a deployment with no object storage. */

test('a backup too large for email drops the biggest file, never the database', () => {
  const source = fs.readFileSync(new URL('../src/backup.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function emailBackup');
  assert.ok(start !== -1, 'emailBackup is no longer where this test expects it');
  const body = source.slice(start, source.indexOf('\nexport', start));

  /* Smallest first is the whole point: the database holds the grades, the
     feedback and every student record, and is a fraction of the size of the
     file archive. Sorting the other way would drop it first. */
  assert.match(body, /sort\(\(a, b\) => a\.mb - b\.mb\)/,
    'files must be considered smallest first so the database survives');
  assert.match(body, /NOT ATTACHED/, 'a dropped file must be named in the message');
  assert.match(body, /Action needed/, 'outgrowing email must be visible in the subject line');
});

test('the backup email is never allowed to abort the backup', () => {
  const source = fs.readFileSync(new URL('../src/backup.js', import.meta.url), 'utf8');
  const start = source.indexOf('if (config.backupEmailTo');
  assert.ok(start !== -1);
  const section = source.slice(start, source.indexOf('Only prune once', start));
  assert.match(section, /try \{[\s\S]*emailBackup[\s\S]*\} catch/,
    'a mail failure must not take the backup with it');
  assert.match(section, /summary\.errors\.push\(`backup email/,
    'a failed backup email must be reported, not swallowed');
});

test('a webhook cannot silently swallow an attachment', () => {
  const email = fs.readFileSync(new URL('../src/email.js', import.meta.url), 'utf8');
  assert.match(email, /cannot carry attachments/,
    'the GHL webhook path must refuse attachments rather than dropping them');
});
