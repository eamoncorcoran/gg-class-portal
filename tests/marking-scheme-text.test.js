import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The marker reads the whole marking scheme, and marks to its splits.
   ------------------------------------------------------------------
   The scheme text kept with a listening question is clipped to a region of
   the page, and on some papers the clip stops short: the 2019 Fógra lost every
   answer line for 1(b) and 3, so the marker had nothing to mark against and
   gave full marks to anything plausible ("go leor fodairrr" got 2 of 2 where
   the scheme gives 1 for an answer short of the point). A complete scheme for
   every listening question, taken straight from the SEC PDF, now travels with
   the marker's code. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const service = read('../pq/server.py');
const schemes = JSON.parse(read('../pq/raw/scheme_text.json'));

test('every listening question with a PDF has its whole scheme beside the marker', () => {
  assert.ok(Object.keys(schemes).length >= 69, `${Object.keys(schemes).length} schemes`);
  const fogra2019 = schemes['aural-fogra-announcement-2019-announcement-1'];
  assert.match(fogra2019, /Nach mbeidh go leor \(dóthain\) fodair acu = 2 mharc/);
  assert.match(fogra2019, /Nach mbeidh fodar acu = 1 mharc/);
  assert.match(fogra2019, /\(Bhí\) na páirceanna faoi uisce = 2 mharc/, 'the 1(b) lines that the clip lost');
  assert.match(fogra2019, /Bhí sé fliuch = 1 mharc/);
  // Cut to the listening section: no reading comprehension or essay scheme in it.
  assert.ok(!/Léamhthuiscint|Ceapadóireacht/.test(fogra2019));
});

test('the marker is given the whole scheme, and falls back to the clipped one', () => {
  assert.match(service, /SCHEME_TEXT = json\.load\(open\(os\.path\.join\(HERE, 'raw', 'scheme_text\.json'\)\)\)/);
  assert.match(service, /return full if full and len\(full\) >= len\(q\.get\('markingSchemeText'\) or ''\) else \(q\.get\('markingSchemeText'\) or ''\)/);
  assert.match(service, /<marking_scheme>\\n\{scheme_for\(q\) or '\(none published\)'\}/);
});

test('the rules say the mark splits are exact and the expected answer is the scheme\'s own', () => {
  assert.match(service, /Mark against the scheme's lines, not against the recording\./);
  assert.match(service, /an answer with that much \\\ninformation gets that lower mark and the verdict partial, however it is spelt/);
  assert.match(service, /never gets full marks: it gets the lower mark where the \\\nscheme shows one, otherwise none/);
  assert.match(service, /expected: one of the scheme's full-mark lines for that part, copied exactly as the scheme prints it/);
  assert.match(service, /For a partial answer say what was missing for full marks/);
  // No em dashes anywhere in what students read.
  const rules = service.slice(service.indexOf('RULES = """'), service.indexOf('"""', service.indexOf('RULES = """') + 10));
  assert.ok(!rules.includes('—'));
});

test('the results show the scheme\'s answer under every answer, and the box shows all of itself while it is written in', () => {
  const card = read('../web/src/components/app/question-card.tsx');
  assert.match(card, /\{r\.expected && \(\s+<div className=\{cx\("rounded-lg px-3 py-2", r\.verdict === "correct" \? "bg-secondary_subtle" : "bg-success-primary"\)\}>/);
  assert.ok(!/r\.verdict !== "correct" && r\.expected/.test(card), 'a right answer shows the scheme too');
  assert.match(card, /onFocus=\{\(e\) => fit\(e\.currentTarget, true\)\}/);
  assert.match(card, /onBlur=\{\(e\) => fit\(e\.currentTarget, false\)\}/);
  assert.match(card, /focus:z-10 focus:bg-primary focus:shadow-md/);
});
