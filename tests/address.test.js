import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COUNTIES, normaliseEircode, normaliseCounty, hasAddress, formatAddress } from '../src/address.js';

/* Addresses have to come out of this in one shape.
   ------------------------------------------------------------------
   The whole reason they are collected is a single sheet with a name against
   each address, which somebody then posts things to. A column holding "Galway",
   "co. galway" and "GALWAY" cannot be sorted or grouped, and an Eircode written
   six different ways cannot be matched against anything. So they are put into
   one form on the way in rather than tidied up afterwards, by which time both
   forms are already in the database. */

test('an Eircode comes out in the one form however it was typed', () => {
  for (const typed of ['A65F4E2', 'a65 f4e2', ' A65-F4E2 ', 'a65f4e2']) {
    assert.equal(normaliseEircode(typed), 'A65 F4E2', `${typed} should normalise`);
  }
});

test('D6W is an Eircode, and rejecting it would reject real addresses', () => {
  /* Dublin 6West. The only routing key that is not a letter and two digits, and
     the obvious thing to write a regex that excludes. */
  assert.equal(normaliseEircode('D6W1234'), 'D6W 1234');
  assert.equal(normaliseEircode('d6w 1a23'), 'D6W 1A23');
});

test('what is not an Eircode is refused rather than stored', () => {
  for (const wrong of ['', null, undefined, 'A65', 'A65 F4E2 X', '1234567', 'ZZ9 ZZ9Z9']) {
    assert.equal(normaliseEircode(wrong), null, `${JSON.stringify(wrong)} is not an Eircode`);
  }
});

test('a county is matched however it was written', () => {
  assert.equal(normaliseCounty('galway'), 'Galway');
  assert.equal(normaliseCounty('Co. Galway'), 'Galway');
  assert.equal(normaliseCounty('  co mayo '), 'Mayo');
  assert.equal(normaliseCounty('Nowhere'), null);
});

test('all thirty-two counties are offered', () => {
  assert.equal(COUNTIES.length, 32);
  /* The course is taught on both sides of the border, and a list stopping at 26
     would quietly tell some students they live somewhere that is not on it. */
  for (const county of ['Antrim', 'Armagh', 'Derry', 'Down', 'Fermanagh', 'Tyrone']) {
    assert.ok(COUNTIES.includes(county), `${county} is missing from the list`);
  }
});

test('an address counts as given only when it could be posted to', () => {
  assert.equal(hasAddress({ address_line1: '12 Ard na Gréine', address_county: 'Galway', eircode: 'H91 ABC1' }), true);
  // A line and a county with no Eircode is not something An Post can act on.
  assert.equal(hasAddress({ address_line1: '12 Ard na Gréine', address_county: 'Galway' }), false);
  assert.equal(hasAddress({ address_county: 'Galway', eircode: 'H91 ABC1' }), false);
  assert.equal(hasAddress(null), false);
  // The second line is genuinely optional, and requiring it would exclude every
  // address that simply does not have one.
  assert.equal(hasAddress({ address_line1: 'Cill Rónáin', address_county: 'Galway', eircode: 'H91 ABC1' }), true);
});

test('an address reads as an address', () => {
  assert.equal(
    formatAddress({ address_line1: '12 Ard na Gréine', address_line2: 'Ballinfoyle', address_county: 'Galway', eircode: 'H91 ABC1' }),
    '12 Ard na Gréine, Ballinfoyle, Co. Galway, H91 ABC1');
  // No second line means no empty gap where it would have been.
  assert.equal(
    formatAddress({ address_line1: 'Cill Rónáin', address_county: 'Galway', eircode: 'H91 ABC1' }),
    'Cill Rónáin, Co. Galway, H91 ABC1');
  assert.equal(formatAddress({}), '');
});

/* The list in the browser and the list on the server have to be the same list,
   or a student picks a county the server then refuses. */
test('the county list the student picks from is the one the server accepts', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const match = app.match(/const COUNTIES = \[([\s\S]*?)\];/);
  assert.ok(match, 'the interface must offer a list of counties');
  const inBrowser = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(inBrowser, [...COUNTIES],
    'the counties offered on screen differ from the ones the server will accept');
});

/* The export is the point of the exercise. A spreadsheet of Irish names read as
   Latin-1 turns every fada into mojibake, and an unquoted comma in an address
   line moves every column after it for that row alone. */
test('the export is written so a spreadsheet can read it', () => {
  const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
  const route = admin.slice(admin.indexOf("router.get('/students/addresses.csv'"));
  const body = route.slice(0, route.indexOf('\n}));'));

  assert.match(body, /\\uFEFF/, 'without a byte order mark Excel reads UTF-8 as Latin-1 and mangles every fada');
  assert.match(body, /replace\(\/"\/g, '""'\)/, 'quotes inside a field have to be doubled');
  assert.match(body, /const cell = /, 'every field must be quoted, since an address line contains commas');
  assert.match(body, /'Name'/, 'a sheet of addresses is useless without the names');
  assert.match(body, /Not given yet/, 'who has not answered is as useful as who has');
});
