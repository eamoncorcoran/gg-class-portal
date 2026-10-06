import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DRAFTING_DEFAULTS } from '../src/ai.js';

/* Which drafts Claude writes at all.
   ------------------------------------------------------------------
   Every draft is billed, and most were thrown away: the teacher writes their own
   check-in reply and board comment, and the note under the corrections is
   personal. The Irish corrections are the slow part to do by hand, so they are
   the one draft on by default. These tests pin the default and the places that
   have to ask before spending. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const ai = read('../src/ai.js');
const student = read('../src/routes/student.js');
const admin = read('../src/routes/admin.js');
const community = read('../src/community.js');
const settings = read('../src/routes/settings.js');
const app = read('../public/app.js');
const mock = read('../public/preview-mock.js');

const fnBody = (source, name) => {
  const start = source.indexOf(name);
  assert.notEqual(start, -1, `${name} must exist`);
  const fn = source.slice(start);
  return fn.slice(0, fn.indexOf('\n}\n'));
};

test('only the Irish corrections are drafted unless somebody says otherwise', () => {
  assert.deepEqual(DRAFTING_DEFAULTS, { corrections: true, generalFeedback: false, checkins: false, board: false });
  assert.ok(Object.isFrozen(DRAFTING_DEFAULTS), 'the default is not something a caller can drift');
});

test('a stored switch only counts when it is actually a boolean', () => {
  /* draftingSwitches copies the defaults and takes a stored key only when it is
     true or false: a row written by hand with "yes" in it must not turn a
     draft on by accident. */
  const body = fnBody(ai, 'export async function draftingSwitches');
  assert.match(body, /typeof stored\?\.\[key\] === 'boolean'/);
  assert.match(body, /getSetting\('drafting', \{\}\)/);
});

test('with general feedback off, the homework request asks for the corrections only', () => {
  const body = fnBody(ai, 'export async function draftHomeworkFeedback');
  assert.match(body, /const correctionsOnly = !switches\.generalFeedback/);
  // The schema is built from the switches, so the model is never asked for a field nobody keeps.
  assert.match(body, /if \(!correctionsOnly\) properties\.generalFeedback = \{ type: 'string' \}/);
  assert.match(body, /required: Object\.keys\(properties\)/);
  // The feedback prompt and the voice that shapes it are not sent either.
  assert.match(body, /correctionsOnly \? '' : prompts\.generalFeedbackPrompt/);
  assert.match(body, /correctionsOnly \? '' : HOMEWORK_VOICE/);
  // And the stored corrections prompt, which may still describe two sections, is told.
  assert.match(body, /Return the Irish corrections only\. Do not write any general feedback/);
});

test('every draft asks the switch before it spends', () => {
  assert.match(fnBody(ai, 'export async function draftCheckinFeedback'), /if \(!test && !\(await draftingSwitches\(\)\)\.checkins\) throw switchedOff/);
  assert.match(fnBody(ai, 'export async function draftCommunityReply'), /if \(!\(await draftingSwitches\(\)\)\.board\) throw switchedOff/);
  assert.match(fnBody(ai, 'export async function draftHomeworkFeedback'), /if \(!switches\.corrections && !switches\.generalFeedback\) throw switchedOff/);
  // A switched-off draft is a 409 with the screen to go to, not a 500.
  assert.match(ai, /switched off under Feedback drafting\.`\), \{ status: 409 \}/);
});

test('a submission nobody will draft for lands as "No draft", never "Generating"', () => {
  /* The state is decided before the row is written and goes in as a parameter,
     so the upsert cannot reset it to generating on a resubmission either. */
  const checkinAt = student.indexOf("const initialState = drafting.checkins ? 'generating' : 'none'");
  assert.notEqual(checkinAt, -1, 'the check-in state is decided from the switch');
  const checkin = student.slice(checkinAt, checkinAt + 3000);
  assert.match(checkin, /INSERT INTO checkins\([\s\S]*?feedback_state=EXCLUDED\.feedback_state/);
  assert.match(checkin, /if \(drafting\.checkins\) \{\s*try \{\s*const reply = await draftCheckinFeedback/);

  const homeworkAt = student.indexOf("const initialState = draftsHomework ? 'generating' : 'none'");
  assert.notEqual(homeworkAt, -1, 'the homework state is decided from the switches');
  const homework = student.slice(homeworkAt, homeworkAt + 5000);
  assert.match(homework, /INSERT INTO homework_submissions\([\s\S]*?feedback_state=EXCLUDED\.feedback_state/);
  assert.match(homework, /if \(draftsHomework\) \{\s*try \{\s*const feedback = await draftHomeworkFeedback/);
  // A section that was not drafted is stored as nothing, not as an empty draft.
  assert.match(homework, /ai_general_feedback=NULLIF\(\$2,''\)/);
  assert.match(homework, /teacher_general_feedback=NULLIF\(\$2,''\)/);
});

test('listening comprehensions are still marked whatever is switched off', () => {
  const homework = student.slice(student.indexOf('INSERT INTO homework_submissions('));
  const marking = homework.slice(homework.indexOf("if (assignment.kind === 'listening') {\n    try {"));
  assert.match(marking.slice(0, 800), /const marked = await markListening\(/);
  assert.doesNotMatch(marking.slice(0, 800), /draftsHomework|draftingSwitches/, 'marking is not behind the drafting switches');
});

test('the board returns "off" before it reads the comments or calls Claude', () => {
  const body = fnBody(community, 'export async function draftReplyFor');
  const off = body.indexOf("return { draft: null, state: 'off' }");
  const cached = body.indexOf("state: 'drafted', cached: true");
  const comments = body.indexOf('What has already been said');
  const call = body.indexOf('await draftCommunityReply(');
  assert.ok(cached !== -1 && off !== -1 && comments !== -1 && call !== -1);
  assert.ok(cached < off, 'a draft already paid for is still shown');
  assert.ok(off < comments && off < call, 'nothing is fetched or drafted once the switch says no');
});

test('the redraft buttons refuse before they touch the state', () => {
  /* Setting "generating" and then failing would leave the row reading
     "Draft failed", which is not what happened. */
  const checkin = admin.slice(admin.indexOf("router.post('/checkins/:id/redraft'"));
  const refuse = checkin.indexOf("switched off under Feedback drafting");
  const generating = checkin.indexOf("feedback_state='generating'");
  assert.ok(refuse !== -1 && refuse < generating);
  const homework = admin.slice(admin.indexOf("router.post('/homework/:id/redraft'"));
  const refuseHw = homework.indexOf("switched off under Feedback drafting");
  const generatingHw = homework.indexOf("feedback_state='generating'");
  assert.ok(refuseHw !== -1 && refuseHw < generatingHw);
});

test('returning homework needs either section, or a voice note, not both sections', () => {
  const route = admin.slice(admin.indexOf("router.post('/homework/:id/return'"));
  assert.match(route.slice(0, 3000), /const hasText = parsed\.data\.corrections\.trim\(\) \|\| parsed\.data\.generalFeedback\.trim\(\)/);
  assert.doesNotMatch(route.slice(0, 3000), /Complete both feedback sections/);
  // The screen applies the same rule rather than refusing earlier than the server would.
  assert.match(app, /if \(!corrections && !generalFeedback && !hasVoiceNote\) throw new Error/);
  assert.doesNotMatch(app, /Complete both feedback sections/);
});

test('the switches reach the screen with the bootstrap and are saved from the settings page', () => {
  assert.match(admin, /drafting: await draftingSwitches\(\) \}\);/);
  assert.match(settings, /router\.put\('\/drafting'/);
  assert.match(settings, /draftingSwitches\(\),\n  \]\);/);
  assert.match(app, /state\.drafting = bootstrap\.drafting/);
  for (const id of ['drafting-corrections', 'drafting-general', 'drafting-checkins', 'drafting-board']) {
    assert.ok(app.includes(`'${id}'`) || app.includes(`"${id}"`), `${id} must be on the settings screen`);
    assert.ok(app.includes(`getElementById('${id}').checked`), `${id} must be saved`);
  }
  // The preview carries the same shape, so the offline demo and the live app agree.
  assert.match(mock, /drafting:\{corrections:true,generalFeedback:false,checkins:false,board:false\}/);
  assert.match(mock, /path==='\/api\/settings\/drafting'&&method==='PUT'/);
});

test('the review drawer offers no draft button for work that is not drafted', () => {
  const body = fnBody(app, 'function lifecycle(stateName, kind');
  assert.match(body, /const retryable = on && \[/);
  assert.match(body, /Drafting is switched off for/);
  // And when only the corrections are drafted, the button says so.
  assert.match(body, /Draft Irish corrections/);
  assert.match(app, /lifecycle\(row\.feedback_state, 'checkin'\)/);
  assert.match(app, /lifecycle\(row\.feedback_state, 'homework'\)/);
  // The board asks for nothing when its switch is known to be off, and draws nothing if told off.
  assert.match(app, /if \(admin && draftingFor\('board'\)\.on\) loadReplyDraft\(thread\.id\)/);
  assert.match(app, /if \(result\.state === 'off'\) \{\s*holder\.remove\(\);\s*return;/);
  // And the slot itself is not drawn, since an empty bordered box is still a box.
  assert.match(app, /\$\{admin && draftingFor\('board'\)\.on \? `<div class="rd" id="reply-draft"><p class="muted small">Drafting a reply…<\/p><\/div>` : ''\}/);
});

test('the Test connection button still drafts its sample with check-ins off', () => {
  assert.match(settings, /\}, \{ test: true \}\);/);
  assert.match(fnBody(ai, 'export async function draftCheckinFeedback'), /\{ test = false \} = \{\}/);
});
