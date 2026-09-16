import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DIALECTS, DIALECT_KEYS, hashText, providerName } from '../src/tts.js';

/* Listening activities.
   ------------------------------------------------------------------
   A story read aloud in a chosen dialect, comprehension questions under it, and
   marking that happens the moment the work is handed in but reaches nobody
   until the teacher has read it.

   Almost everything guarded here is about what does not leave the server. A
   student who can read the expected answers, or see their score before the
   teacher has looked at it, has an exercise that is worth nothing. */

const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const media = fs.readFileSync(new URL('../src/routes/media.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../migrations/045_listening_activities.sql', import.meta.url), 'utf8');

test('the dialects a recording can be filed under', () => {
  /* Standard is here for an upload that is not in any one dialect: an exam
     tape, a newsreader, the Caighdeán as it is read out in a classroom. */
  assert.deepEqual(DIALECT_KEYS, ['connacht', 'munster', 'ulster', 'standard']);
  for (const dialect of DIALECTS) {
    assert.ok(dialect.label && dialect.hint, `${dialect.key} needs a label and a hint`);
  }
});

test('no speech key means a clear refusal, not a broken button', () => {
  const tts = fs.readFileSync(new URL('../src/tts.js', import.meta.url), 'utf8');
  assert.match(tts, /providerName\(\) === 'none'/);
  assert.match(tts, /Set ABAIR_API_KEY/);
  assert.match(tts, /status: 503/);
  /* With no key the button is simply not drawn, rather than drawn and refused.
     Uploading is the main path now, so there is nothing missing from the screen
     when synthesis is unavailable. */
  assert.match(app, /dialect\.synthesisable && data\.configured/);
  assert.equal(providerName(), process.env.ABAIR_API_KEY ? 'abair' : 'none');
});

test('a story edited after it was read aloud is marked as out of step', () => {
  assert.notEqual(hashText('Bhí fear ann.'), hashText('Bhí bean ann.'));
  assert.equal(hashText('Bhí fear ann.'), hashText('Bhí fear ann.'));
  assert.match(admin, /row\.state === 'ready' && row\.source !== 'upload' && row\.text_hash !== current/);
  assert.match(app, /Read from an older version of the story/);
});

test('one dialect failing does not take the others with it', () => {
  const body = admin.slice(admin.indexOf("router.post('/assignments/:id/listening/render'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  assert.match(inner, /for \(const dialect of parsed\.data\.dialects\)/);
  assert.match(inner, /state='failed', error=\$1/);
  assert.match(inner, /results\.push\(\{ dialect, state: 'failed'/);
});

test('the expected answers never leave the server on a student request', () => {
  /* Both student queries build their questions from a named list of columns
     rather than selecting the row, which is what keeps the answer sheet out of
     a payload that is otherwise the whole assignment. */
  const built = student.match(/'id',q\.id,'position',q\.position,'prompt',q\.prompt,'imageUrl',q\.image_url,'required',q\.required/g) || [];
  assert.ok(built.length >= 1, 'the student question list has to be built column by column');
  assert.doesNotMatch(student, /q\.expected_answer/, 'no student query may select it');
  assert.doesNotMatch(student, /SELECT q\.\*/);
  // The marking reads them in a query of its own, on the submit path only.
  assert.match(student, /SELECT position, prompt, expected_answer, marks FROM assignment_questions/);
});

test('nothing the machine produced reaches a student, ever', () => {
  const body = student.slice(student.indexOf('const FEEDBACK_COLUMNS'));
  const list = body.slice(0, body.indexOf('];'));
  for (const column of ['ai_feedback', 'ai_corrections', 'ai_general_feedback',
    'ai_marks', 'ai_score', 'ai_max']) {
    assert.ok(list.includes(`'${column}'`), `${column} has to be stripped`);
  }
  assert.match(body, /if \(column\.startsWith\('ai_'\)\) delete out\[column\]/,
    'the ai_ columns go even once the feedback has been returned');
});

test("a teacher's draft is held back as tightly as the machine's", () => {
  /* This was the hole. The ai_ columns were stripped and the teacher_ ones were
     not, and the teacher_ ones are seeded with the model's draft the moment the
     work is submitted. So a student reloading the page a second after handing up
     was sent the machine's corrections, its general feedback, and for a
     listening comprehension its marks and their score. */
  const body = student.slice(student.indexOf('const FEEDBACK_COLUMNS'));
  const list = body.slice(0, body.indexOf('];'));
  for (const column of ['teacher_feedback', 'teacher_corrections', 'teacher_general_feedback',
    'teacher_marks', 'teacher_score', 'teacher_max', 'teacher_audio_path']) {
    assert.ok(list.includes(`'${column}'`), `${column} has to be held until it is returned`);
  }
  assert.match(body, /if \(!returned\) for \(const column of FEEDBACK_COLUMNS\) delete out\[column\]/);
});

test('a listening comprehension is marked on submission, not on request', () => {
  const body = student.slice(student.indexOf("router.post('/assignments/:id/submit'"));
  assert.match(body, /if \(assignment\.kind === 'listening'\)/);
  assert.match(body, /markListening\(/);
  /* Marking failing is not a failed submission: the work is saved either way and
     the teacher marks it themselves, which is what they would be doing if none
     of this existed. */
  assert.match(body, /console\.error\('Listening marking failed', error\)/);
});

test('the teacher can change a mark before it goes out', () => {
  assert.match(admin, /marks: z\.array\(z\.object\(\{/);
  assert.match(admin, /UPDATE homework_submissions SET teacher_marks=\$1::jsonb, teacher_score=\$2, teacher_max=\$3/);
  assert.match(app, /function marksFromScreen\(\)/);
  assert.match(app, /marks: marksFromScreen\(\)/);
  // And a mark above what the question is worth cannot be released.
  assert.match(admin, /Math\.min\(mark\.awarded, mark\.available\)/);
});

test('a recording is behind the same three tests the assignment is', () => {
  const body = media.slice(media.indexOf("router.get('/listening/:assignmentId/:dialect'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  assert.match(inner, /row\.status === 'published'/);
  assert.match(inner, /!row\.archived_at/);
  assert.match(inner, /new Date\(row\.visible_at\)\.getTime\(\) <= Date\.now\(\)/);
  assert.match(inner, /FROM class_students WHERE class_id=\$1 AND student_id=\$2 AND active=true/);
  // Scrubbing back over a sentence is the exercise, so ranges are supported.
  assert.match(inner, /Accept-Ranges/);
  assert.match(inner, /Content-Range/);
});

test('the player survives moving between questions', () => {
  /* The rolling form rebuilds its body on every step. Without this the story
     would start again from the beginning at question two, which makes a
     listening comprehension impossible to answer. */
  assert.match(app, /function bindListeningPanel\(\)/);
  assert.match(app, /audio\.currentTime = Math\.min\(listen\.at/);
  assert.match(app, /listen\.at = audio\.currentTime/);
  // Drawn on every step rather than only the first.
  assert.match(app, /<div class="rolling-stage">\$\{listeningPanel\(assignment, form\)\}/);
});

test('the transcript starts where the teacher set it and is the student\'s after that', () => {
  assert.match(app, /textShown: Boolean\(data\.assignment\.listening_text_shown\)/);
  assert.match(app, /id="listen-toggle-text"/);
  assert.match(app, /listen\.textShown = !listen\.textShown/);
  assert.match(migration, /listening_text_shown boolean NOT NULL DEFAULT false/,
    'listening first is the default, because reading it defeats the exercise');
});

test('a mark belongs to the assignment it was given for', () => {
  assert.match(migration, /ADD CONSTRAINT assignments_kind_check CHECK \(kind IN \('written', 'listening'\)\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS listening_audio_unique/);
  assert.match(migration, /ON DELETE CASCADE/);
});

/* A listening activity from the spreadsheet.
   ------------------------------------------------------------------
   The import is how a term gets built, so an activity that could only be made
   through the form would not get made. */

test('a row with a story in it is a listening activity', () => {
  /* No Kind column to remember. Pasting a story is the thing that makes it one,
     which is also how somebody describes it out loud. */
  assert.match(admin, /story: \['story', 'text', 'listening', 'listening text', 'passage', 'script'\]/);
  assert.match(admin, /const kind = kindText \? \(kindText\.startsWith\('listen'\) \? 'listening' : 'written'\)\s*\n\s*: \(story \? 'listening' : 'written'\)/);
});

test('the expected answers sit beside the questions in the sheet', () => {
  assert.match(admin, /function expectedFrom\(row\)/);
  assert.match(admin, /\^a\\s\*\(\\d\+\)\$\|\^answer\\s\*\(\\d\+\)\$\|\^expected\\s\*\(\\d\+\)\$/);
  assert.match(admin, /function marksFrom\(row\)/);
  /* Lined up against the questions rather than left ragged, so row three of the
     sheet and question three of the assignment are the same thing. */
  assert.match(admin, /expected: questions\.map\(\(_, index\) => expected\[index\] \|\| ''\)/);
  assert.match(admin, /marks: questions\.map\(\(_, index\) => Number\(marks\[index\]\) \|\| 1\)/);
});

test('a listening row with no expected answers is refused', () => {
  /* Marked against what the teacher wrote, so a row with nothing to mark
     against would come back as full marks for everybody. */
  /* The condition, not just the words. A guard rewritten to never fire still
     contains its own message, so matching the message proves nothing. */
  assert.match(admin, /const answered = expected\.filter\(Boolean\)\.length;/);
  assert.match(admin, /if \(!answered\) problems\.push\('no expected answers/);
  assert.match(admin, /else if \(answered < questions\.length\) \{/);
  assert.match(admin, /if \(!story\) problems\.push\('a listening activity needs a story/);
  assert.match(admin, /const bad = marks\.slice\(0, questions\.length\)\.find\(\(value\) => value && !\/\^\\d\+\$\/\.test\(value\)\);/);
  // And all of it only for a listening row.
  assert.match(admin, /if \(kind === 'listening'\) \{/);
});

test('an existing written sheet still imports unchanged', () => {
  /* The new columns are additions at the end. A sheet with Deadline, Title and
     Q1 and nothing else has no Story, so it is written, which is what it was
     before any of this existed. */
  const body = admin.slice(admin.indexOf('function readAssignmentCsv'));
  const inner = body.slice(0, body.indexOf('\n}\n'));
  assert.match(inner, /const kind = kindText/);
  assert.doesNotMatch(inner, /problems\.push\('no story'\)/,
    'a written row must never be asked for a story');
});

test('the template shows a listening row rather than describing one', () => {
  const body = admin.slice(admin.indexOf("router.get('/classes/:id/assignment-template'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  assert.match(inner, /Deadline,Title,Instructions,Opens,Deadline type,Story,Show text,Q1,Q2,Q3,A1,A2,A3,M1,M2,M3/);
  assert.match(inner, /Cluastuiscint/, 'a filled-in listening line is how the columns are learned');
});

test('a term of stories can be read aloud in one go', () => {
  const body = admin.slice(admin.indexOf("router.post('/classes/:id/listening/render-all'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  /* Running it again after adding one row must not re-read the other eleven. */
  assert.match(inner, /existing\?\.state === 'ready' && existing\.text_hash === hashText\(assignment\.listening_text\)/);
  assert.match(inner, /continue;/);
  assert.match(inner, /kind='listening'/);
  // Asked rather than done: thirty six trips to a speech service is a decision.
  assert.match(app, /function offerBulkRender\(classId, count\)/);
  assert.match(app, /if \(result\.listening\) offerBulkRender\(classId, result\.listening\)/);
});

/* Recordings the teacher made.
   ------------------------------------------------------------------
   The better answer most of the time and the cheaper one: a real speaker in a
   real dialect beats a synthesiser, and a file recorded once costs nothing every
   time it is played. */

test('a recording can be uploaded instead of synthesised', () => {
  const body = admin.slice(admin.indexOf("router.post('/assignments/:id/listening/upload'"));
  const inner = body.slice(0, body.indexOf("router.patch('/assignments/:id/listening/:dialect'"));
  assert.match(admin, /VOICE_MIME_TYPES\.has\(String\(file\.mimetype\)/,
    'anything that is not audio has to be refused');
  assert.match(inner, /audioDir\(\)/, 'it goes in the private store, not the public one');
  assert.match(inner, /source='upload'/);
  /* The old file goes only once the new one is safely written. A failed write
     must not leave the week with nothing to play. */
  assert.match(inner, /const previous = await one\(/);
  assert.match(inner, /if \(previous\?\.file_path && path\.basename\(previous\.file_path\) !== name\)/);
  assert.match(admin, /const listeningUpload = multer\(\{/);
  assert.match(admin, /fileSize: AUDIO_UPLOAD_MB \* 1024 \* 1024/);
});

test('an upload is never treated as out of step with the story', () => {
  /* A synthesised reading is derived from the text, so editing the text makes it
     wrong. An upload is not, so it does not. */
  assert.match(admin, /row\.source !== 'upload' && row\.text_hash !== current/);
  assert.match(admin, /if \(existing\?\.source === 'upload'\) continue;/,
    'and reading a term aloud must not overwrite one somebody recorded on purpose');
});

test('the dialect tag is the teacher\'s words, not the portal\'s', () => {
  /* So a recording can say Corca Dhuibhne, or name the speaker, rather than
     carrying the portal's idea of what the dialect is called. */
  assert.match(admin, /tag: row\?\.label \|\| null/);
  assert.doesNotMatch(admin, /\n        label: row\?\.label/,
    'the dialect already has a label; one silently overwriting the other put the tag where the heading belongs');
  assert.match(student, /jsonb_build_object\('key',la\.dialect,'label',la\.label\)/);
  assert.match(app, /function dialectTag\(entry\)/);
  assert.match(app, /return DIALECT_LABELS\[entry\.key\] \|\| entry\.key;/);
});

test('standard is offered for upload but never synthesised', () => {
  const tts = fs.readFileSync(new URL('../src/tts.js', import.meta.url), 'utf8');
  assert.match(tts, /export const SYNTHESISABLE = Object\.freeze\(\['connacht', 'munster', 'ulster'\]\)/);
  assert.ok(DIALECT_KEYS.includes('standard'), 'standard is a dialect a recording can be filed under');
  /* Picking a dialect voice and calling it standard would be a lie told to a
     student who is learning to tell them apart. */
  assert.match(tts, /if \(!SYNTHESISABLE\.includes\(dialect\)\)/);
  assert.match(tts, /There is no synthesised voice for/);
  assert.match(admin, /synthesisable: SYNTHESISABLE\.includes\(dialect\.key\)/);
});

test('a recording can be relabelled or removed without touching the story', () => {
  assert.match(admin, /router\.patch\('\/assignments\/:id\/listening\/:dialect'/);
  assert.match(admin, /router\.delete\('\/assignments\/:id\/listening\/:dialect'/);
  const body = admin.slice(admin.indexOf("router.delete('/assignments/:id/listening/:dialect'"));
  assert.match(body.slice(0, body.indexOf('\n}));')), /fs\.unlink\(row\.file_path\)/,
    'the file goes with the row rather than being left behind on the disk');
});

test('the stand-in voice cannot run in production', () => {
  /* It reads Irish with an English voice. It exists so the feature can be tested
     without an API key, and an English voice reading Irish to a class would be a
     hard thing to explain. */
  const tts = fs.readFileSync(new URL('../src/tts.js', import.meta.url), 'utf8');
  const body = tts.slice(tts.indexOf('export function isStandIn'));
  assert.match(body.slice(0, body.indexOf('\n}')), /if \(process\.env\.NODE_ENV === 'production'\) return false;/);
  // And it is not something the blueprint can switch on.
  const blueprint = fs.readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
  assert.doesNotMatch(blueprint, /TTS_PROVIDER/);
});

/* Making one, on one screen.
   ------------------------------------------------------------------
   A recording belongs to an assignment, so there was nothing to upload against
   until one existed, and the form said so by telling the teacher to save and
   come back. That is a fine sentence and a bad way to spend a Tuesday. */

test('hidden fields are actually hidden', () => {
  /* Every layout rule in the stylesheet sets a display, and each one beats the
     browser's own [hidden] rule. So a field switched off in script stayed on
     screen: the story box sat under written assignments for anyone who looked. */
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\[hidden\]\{display:none !important\}/);
});

test('a tick is not stretched to the width of a text box', () => {
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const global = css.indexOf('.form-field input,.form-field select,.form-field textarea,input,select,textarea{width:100%');
  const fix = css.indexOf('input[type="radio"],input[type="checkbox"]{width:auto');
  assert.ok(global > -1 && fix > -1, 'both rules have to be there');
  /* Same specificity, so source order decides it. Written before, the dot floats
     at the far end of its own label. */
  assert.ok(fix > global, 'the correction has to come after the rule it corrects');
});

test('the first save turns creating into editing, in place', () => {
  const body = app.slice(app.indexOf('function openAssignmentModal'));
  const inner = body.slice(0, body.indexOf('\nfunction '));
  assert.match(inner, /let saved = assignment;/);
  assert.match(inner, /saved \? `\/api\/admin\/assignments\/\$\{saved\.id\}` : '\/api\/admin\/assignments'/);
  /* A listening activity is not finished until it has something to play, so the
     dialog stays open on the recordings rather than closing on a story nobody
     can hear. A written one closes, which is what it always did. */
  assert.match(inner, /if \(payload\.kind === 'listening'\) \{/);
  assert.match(inner, /Published\. Now add the recordings\./);
  assert.match(inner, /await renderListeningPanel\(saved\)/);
  assert.match(inner, /scrollIntoView/);
});

test('the recordings step says what is about to happen, not where to go', () => {
  assert.match(app, /The upload buttons appear here straight afterwards, without leaving this screen\./);
  assert.doesNotMatch(app, /Save the assignment and reopen it/,
    'sending somebody away and back is the thing being fixed');
});

test('the kind of assignment reads as a decision', () => {
  /* Two cards rather than two radio rows, because the choice changes what the
     rest of the form asks for. */
  assert.match(app, /class="kind-choice"/);
  assert.match(app, /class="kind-card /);
  assert.match(app, /card\.classList\.toggle\('is-on', card\.querySelector\('input'\)\.checked\)/);
  // And the listening fields are numbered, because the order matters.
  assert.match(app, /<span class="form-step">1<\/span>/);
  assert.match(app, /<span class="form-step">2<\/span>/);
});

test('a WAV is a WAV whatever the browser calls it', async () => {
  /* WAV has four spellings in the wild and browsers disagree about which to
     send, so a teacher whose recorder writes audio/wave was told their WAV was
     not a supported format. */
  const { VOICE_MIME_TYPES, audioTypeFor } = await import('../src/voice.js');
  for (const spelling of ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/x-pn-wav']) {
    assert.ok(VOICE_MIME_TYPES.has(spelling), `${spelling} has to be accepted`);
  }
  /* A file dragged from some applications arrives with no type at all, and
     octet-stream is a browser giving up rather than a claim about the contents.
     Both fall back to the name. */
  assert.equal(audioTypeFor({ mimetype: '', originalname: 'take.wav' }), 'audio/wav');
  assert.equal(audioTypeFor({ mimetype: 'application/octet-stream', originalname: 'take.wav' }), 'audio/wav');
  assert.equal(audioTypeFor({ mimetype: '', originalname: 'take.m4a' }), 'audio/mp4');
  // And the fallback is not a way in for anything at all.
  assert.equal(audioTypeFor({ mimetype: '', originalname: 'notes.txt' }), null);
  assert.equal(audioTypeFor({ mimetype: 'text/plain', originalname: 'notes.txt' }), null);
  assert.equal(audioTypeFor({ mimetype: '', originalname: 'noextension' }), null);
});

test('every accepted audio type has an extension to be stored under', async () => {
  const { VOICE_MIME_TYPES, audioExtension } = await import('../src/voice.js');
  for (const type of VOICE_MIME_TYPES) {
    /* .webm is the fallback, so a type landing on it by accident would be
       written to disk under a name that lies about what is in it. */
    if (type === 'audio/webm') continue;
    assert.notEqual(audioExtension(type), '.webm', `${type} has no extension of its own`);
  }
});

test('a published assignment says so, and the way out stops saying Cancel', () => {
  /* A listening activity keeps the dialog open so the recordings can be added
     without leaving, which means the usual signal that something worked, the
     dialog closing, is not available. It read as nothing having happened, and
     the only way out said Cancel, which after publishing is a lie. */
  assert.match(app, /function markAssignmentSaved\(saved, payload\)/);
  const body = app.slice(app.indexOf('function markAssignmentSaved'));
  const inner = body.slice(0, body.indexOf('\nfunction '));
  assert.match(inner, /leave\.textContent = 'Done'/);
  assert.match(inner, /id="assignment-live"/);
  assert.match(inner, /<strong>Published\.<\/strong>/);
  /* Relabelled rather than rebuilt: replacing the footer throws away the save
     button's listener and leaves something that looks like a button and is not. */
  assert.doesNotMatch(inner, /footer\.innerHTML =/);
  assert.match(app, /markAssignmentSaved\(saved, payload\)/);
});

test('the resources picker takes audio, because it is the obvious place to try', () => {
  /* This is what "the audio file type is not loading" actually was. The
     recordings block is one thing; beside it sits a picker called "files
     students can use" that takes any file and has no accept list, and it
     refused every recording with "this file type is not allowed". Somebody
     reaching for it with an MP3 had no reason to look anywhere else. */
  assert.match(admin, /\.\.\.VOICE_MIME_TYPES,/, 'a class resource can be a recording');
  assert.match(admin, /'video\/mp4','video\/quicktime','video\/webm'/);
  const body = admin.slice(admin.indexOf('const diskUpload = multer'));
  const inner = body.slice(0, body.indexOf('\n});'));
  assert.match(inner, /Boolean\(audioTypeFor\(file\)\)/,
    'and the same name fallback the recordings use');
  assert.match(inner, /is not a file type the portal takes/);
  // It still has to refuse what it should.
  assert.match(inner, /if \(!allowed\)/);
});

test('the two pickers say which is which', () => {
  /* One takes handouts, the other takes the recording, and they sit in the same
     form. On a listening activity the resources field says so outright. */
  assert.match(app, /Handouts, PDFs, images, anything they need alongside the questions\./);
  assert.match(app, /<b>Not the listening recording\.<\/b>/);
  assert.match(app, /That goes under <b>The recordings<\/b> above/);
});

test('one recording is the normal case and asks nothing extra', async () => {
  /* Four empty rows headed Connacht, Munster, Ulster and Standard made it look
     like four recordings were expected, and asked a teacher holding one file to
     first decide which dialect it counted as. */
  const body = app.slice(app.indexOf('async function renderListeningPanel'));
  const inner = body.slice(0, body.indexOf('\nfunction '));
  assert.match(inner, /const plain = done\.length <= 1;/);
  assert.match(inner, /<strong>The recording<\/strong>/);
  assert.match(inner, /One recording is all most stories need\./);
  // Dialects are still there, folded away, for anybody who does have several.
  assert.match(inner, /<details class="listen-more"/);
  assert.match(inner, /Add more, one per dialect/);
  assert.match(inner, /Only if you have separate recordings\./);
});

test('a single recording is not labelled with a dialect nobody named', () => {
  /* It is filed under standard, which means no particular dialect. Calling it
     Standard on the student's screen would be claiming something never said. */
  const body = app.slice(app.indexOf('function dialectTag'));
  const inner = body.slice(0, body.indexOf('\n}'));
  assert.match(inner, /if \(entry\.label\) return entry\.label;/);
  assert.match(inner, /if \(entry\.key === 'standard'\) return '';/);
  // And an empty tag draws nothing rather than an empty pill.
  assert.match(app, /dialectTag\(available\[0\]\) \? `<span class="listen-tag">/);
});

test('a filename keeps its fadas', async () => {
  /* Multipart form data carries no encoding for a filename, so multer reads the
     bytes as latin1: an-scéal.wav arrives as an-scÃ©al.wav, which on a course
     taught through Irish is most of the filenames. */
  const { originalName } = await import('../src/voice.js');
  const mangled = Buffer.from('an-scéal-ó-Ghaillimh.wav', 'utf8').toString('latin1');
  assert.equal(originalName({ originalname: mangled }), 'an-scéal-ó-Ghaillimh.wav');
  // A name that really was latin1 is left alone rather than turned into worse.
  assert.equal(originalName({ originalname: 'café.wav' }), 'café.wav');
  assert.equal(originalName({ originalname: 'take.wav' }), 'take.wav');
  assert.equal(originalName({ originalname: '' }), '');
  // And it is used where the name is stored and shown, not just computed.
  assert.match(admin, /originalName\(req\.file\)\.slice\(0, 200\)/);
  assert.match(admin, /fileName: originalName\(file\)/);
});
