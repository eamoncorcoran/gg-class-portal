/**
 * The class report: everything written down during a live session, read
 * back as one document for the teacher. Who was there and for how long, who
 * was not, every phrase and who said it, skipped it or got it wrong, the
 * words the class as a whole is getting wrong, every check and quiz, how
 * they found the class and what they would change.
 *
 * Two shapes: the data, for the console and the tests, and the PDF.
 */
import PDFDocument from 'pdfkit';
import { query, one } from '../db.js';

const minutes = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));

export async function listSessions(limit = 20) {
  const rows = (await query(
    `SELECT s.*,
       (SELECT count(DISTINCT student_id)::int FROM live_events e WHERE e.session_id=s.id AND e.student_id IS NOT NULL) present,
       (SELECT string_agg(c.programme_name, ', ' ORDER BY c.programme_name) FROM classes c WHERE c.id = ANY(s.class_ids)) classes
     FROM live_sessions s ORDER BY s.started_at DESC LIMIT $1`, [limit])).rows;
  return rows.map((s) => ({ id: s.id, classes: s.classes || 'Every class', startedAt: s.started_at, endedAt: s.ended_at, present: s.present,
    minutes: minutes(s.started_at, s.ended_at || new Date()) }));
}

export async function sessionData(sessionId) {
  const session = await one('SELECT * FROM live_sessions WHERE id=$1', [sessionId]);
  if (!session) return null;
  const endedAt = session.ended_at || new Date();
  const classes = (await query('SELECT id, programme_name FROM classes WHERE id = ANY($1::uuid[])', [session.class_ids])).rows;
  const roster = session.class_ids.length
    ? (await query(
      `SELECT DISTINCT u.id, u.name FROM class_students cs JOIN users u ON u.id=cs.student_id
       WHERE cs.class_id = ANY($1::uuid[]) AND cs.active=true AND u.active=true AND u.withdrawn_at IS NULL ORDER BY u.name`, [session.class_ids])).rows
    : [];
  const events = (await query(
    `SELECT e.kind, e.payload, e.at, e.student_id, COALESCE(u.name, e.payload->>'name') name
     FROM live_events e LEFT JOIN users u ON u.id=e.student_id WHERE e.session_id=$1 ORDER BY e.at`, [sessionId])).rows;
  const prompts = (await query('SELECT * FROM live_prompts WHERE session_id=$1 ORDER BY created_at', [sessionId])).rows;

  /* Attendance: first seen to last seen, with the session's end for anyone
     still there when it ended. */
  const seen = new Map();
  for (const e of events) {
    if (!e.student_id || !['present', 'left', 'phrase', 'understand', 'rating', 'quiz_answer', 'enjoy', 'idea'].includes(e.kind)) continue;
    const s = seen.get(e.student_id) || { id: e.student_id, name: e.name || 'Student', first: e.at, last: e.at, left: null };
    if (e.at < s.first) s.first = e.at;
    if (e.at > s.last) s.last = e.at;
    if (e.kind === 'left') s.left = e.at; else if (e.kind === 'present') s.left = null;
    seen.set(e.student_id, s);
  }
  const attendance = [...seen.values()].map((s) => ({ ...s, minutes: minutes(s.first, s.left || endedAt) })).sort((a, b) => b.minutes - a.minutes);
  const presentIds = new Set(attendance.map((s) => s.id));
  const absent = roster.filter((r) => !presentIds.has(r.id)).map((r) => r.name);

  /* Phrases: the last result each student gave for each phrase, and every
     graded word along the way (an attempt that failed still tells us which
     word). */
  const phrases = new Map();
  const wordTally = new Map();
  const perStudent = new Map();
  for (const e of events) {
    if (e.kind !== 'phrase') continue;
    const p = phrases.get(e.payload.phraseId) || { id: e.payload.phraseId, irish: e.payload.irish || '', latest: new Map(), attempts: 0 };
    p.attempts += 1;
    p.latest.set(e.student_id, e.payload.result);
    phrases.set(e.payload.phraseId, p);
    for (const w of e.payload.words || []) {
      const key = String(w.w || '').replace(/[^\p{L}\p{M}'-]/gu, '').toLowerCase();
      if (!key) continue;
      const t = wordTally.get(key) || { word: w.w, wrong: 0, fair: 0, right: 0 };
      if (w.g === 'wrong') t.wrong += 1; else if (w.g === 'goodEffort') t.fair += 1; else t.right += 1;
      wordTally.set(key, t);
    }
    const st = perStudent.get(e.student_id) || { name: e.name || 'Student', passed: 0, skipped: 0, failedAttempts: 0, seen: new Set() };
    if (e.payload.result === 'failed') st.failedAttempts += 1;
    st.seen.add(e.payload.phraseId);
    perStudent.set(e.student_id, st);
  }
  for (const p of phrases.values()) {
    p.passed = [...p.latest.values()].filter((r) => r === 'passed').length;
    p.skipped = [...p.latest.values()].filter((r) => r === 'skipped').length;
    p.unfinished = [...p.latest.values()].filter((r) => r === 'failed').length;
    for (const [sid, r] of p.latest) { const st = perStudent.get(sid); if (!st) continue; if (r === 'passed') st.passed += 1; else if (r === 'skipped') st.skipped += 1; }
  }
  const hardWords = [...wordTally.values()].filter((t) => t.wrong + t.fair > 0)
    .sort((a, b) => (b.wrong * 2 + b.fair) - (a.wrong * 2 + a.fair)).slice(0, 15);

  /* The checks and the quizzes. */
  const checks = prompts.map((pr) => {
    const mine = events.filter((e) => e.payload?.promptId === pr.id);
    if (pr.kind === 'understand') {
      const latest = new Map(); for (const e of mine) if (e.kind === 'understand') latest.set(e.student_id, e);
      const vals = [...latest.values()];
      return { kind: pr.kind, topic: pr.topic, at: pr.created_at, responded: vals.length, yes: vals.filter((e) => e.payload.yes).length,
        notYet: vals.filter((e) => !e.payload.yes).map((e) => e.name).sort() };
    }
    if (pr.kind === 'rating' || pr.kind === 'enjoy') {
      const latest = new Map(); for (const e of mine) if (e.kind === pr.kind) latest.set(e.student_id, e);
      const scores = [...latest.values()].map((e) => Number(e.payload.score));
      return { kind: pr.kind, topic: pr.topic, at: pr.created_at, responded: scores.length,
        average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
        low: [...latest.values()].filter((e) => Number(e.payload.score) <= 5).map((e) => `${e.name} (${e.payload.score})`).sort() };
    }
    const byStudent = new Map();
    for (const e of mine) {
      if (e.kind !== 'quiz_answer') continue;
      const s = byStudent.get(e.student_id) || { name: e.name, answers: new Map() };
      s.answers.set(Number(e.payload.index), e.payload);
      byStudent.set(e.student_id, s);
    }
    const total = (pr.questions || []).length;
    return { kind: 'quiz', topic: pr.topic, at: pr.created_at, total, responded: byStudent.size,
      finished: [...byStudent.values()].filter((s) => s.answers.size >= total).length,
      questions: (pr.questions || []).map((q, i) => {
        const given = [...byStudent.values()].map((s) => s.answers.get(i)).filter(Boolean);
        const wrong = {}; for (const g of given) if (!g.correct) wrong[g.answer] = (wrong[g.answer] || 0) + 1;
        return { q: q.q, answer: q.answers[0], answered: given.length, correct: given.filter((g) => g.correct).length,
          commonWrong: Object.entries(wrong).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${a} (${n})`) };
      }),
      students: [...byStudent.values()].map((s) => ({ name: s.name, correct: [...s.answers.values()].filter((a) => a.correct).length, answered: s.answers.size, total })).sort((a, b) => b.correct - a.correct) };
  });

  /* How the class was. */
  const enjoyLatest = new Map(); for (const e of events) if (e.kind === 'enjoy' && !e.payload.promptId) enjoyLatest.set(e.student_id, e);
  const enjoyScores = [...enjoyLatest.values()].map((e) => Number(e.payload.score));
  const ideas = events.filter((e) => e.kind === 'idea').map((e) => ({ name: e.name, text: e.payload.text, at: e.at }));

  const students = [...perStudent.entries()].map(([id, s]) => {
    const att = attendance.find((a) => a.id === id);
    const quiz = checks.filter((c) => c.kind === 'quiz').flatMap((c) => c.students.filter((q) => q.name === s.name));
    return { name: s.name, minutes: att ? att.minutes : 0, passed: s.passed, skipped: s.skipped, failedAttempts: s.failedAttempts,
      quizCorrect: quiz.reduce((a, q) => a + q.correct, 0), quizTotal: quiz.reduce((a, q) => a + q.total, 0),
      enjoyed: enjoyLatest.get(id) ? Number(enjoyLatest.get(id).payload.score) : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
  for (const a of attendance) if (!perStudent.has(a.id)) students.push({ name: a.name, minutes: a.minutes, passed: 0, skipped: 0, failedAttempts: 0, quizCorrect: 0, quizTotal: 0, enjoyed: enjoyLatest.get(a.id) ? Number(enjoyLatest.get(a.id).payload.score) : null });
  students.sort((a, b) => a.name.localeCompare(b.name));

  return {
    session: { id: session.id, startedAt: session.started_at, endedAt: session.ended_at, minutes: minutes(session.started_at, endedAt),
      classes: classes.map((c) => c.programme_name).join(', ') || 'Every class', rosterSize: roster.length },
    attendance, absent, students,
    phrases: [...phrases.values()].map((p) => ({ id: p.id, irish: p.irish, passed: p.passed, skipped: p.skipped, unfinished: p.unfinished, attempts: p.attempts })),
    hardWords, checks,
    enjoyment: { responded: enjoyScores.length, average: enjoyScores.length ? Math.round((enjoyScores.reduce((a, b) => a + b, 0) / enjoyScores.length) * 10) / 10 : null,
      distribution: Array.from({ length: 10 }, (_, i) => enjoyScores.filter((s) => s === i + 1).length) },
    ideas,
  };
}

/* ---- the PDF ------------------------------------------------------------ */
const when = (iso) => new Intl.DateTimeFormat('en-IE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Dublin' }).format(new Date(iso));
const clock = (iso) => new Intl.DateTimeFormat('en-IE', { timeStyle: 'short', timeZone: 'Europe/Dublin' }).format(new Date(iso));

export function renderReportPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 54, left: 54, right: 54 }, info: { Title: 'Class report', Author: 'Gaeilgeoir Guides Class Portal' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const green = '#3f8f2b', ink = '#1f2d1c', muted = '#5c6b59', line = '#e3e9df';
    const width = doc.page.width - 108;

    const heading = (text) => { ensure(40); doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(14).fillColor(green).text(text); doc.moveTo(54, doc.y + 3).lineTo(54 + width, doc.y + 3).strokeColor(line).lineWidth(1).stroke(); doc.moveDown(0.6); doc.fillColor(ink); };
    const para = (text, opts = {}) => { doc.font('Helvetica').fontSize(10.5).fillColor(opts.color || ink).text(text, { width, ...opts }); };
    const ensure = (h) => { if (doc.y + h > doc.page.height - 54) doc.addPage(); };
    const table = (cols, rows) => {
      if (!rows.length) { para('Nothing recorded.', { color: muted }); return; }
      const total = cols.reduce((a, c) => a + c.w, 0);
      const scale = width / total;
      const rowHeight = 16;
      const header = () => {
        ensure(rowHeight * 2);
        let x = 54;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(muted);
        for (const c of cols) { doc.text(c.h.toUpperCase(), x, doc.y, { width: c.w * scale - 6, lineBreak: false, continued: false }); x += c.w * scale; doc.y -= doc.currentLineHeight(); }
        doc.y += rowHeight - 3;
        doc.moveTo(54, doc.y).lineTo(54 + width, doc.y).strokeColor(line).stroke();
        doc.y += 4; doc.x = 54;
      };
      header();
      doc.font('Helvetica').fontSize(9.5).fillColor(ink);
      for (const r of rows) {
        if (doc.y + rowHeight > doc.page.height - 54) { doc.addPage(); header(); doc.font('Helvetica').fontSize(9.5).fillColor(ink); }
        let x = 54; const y = doc.y;
        cols.forEach((c, i) => { doc.text(String(r[i] ?? ''), x, y, { width: c.w * scale - 6, lineBreak: false, ellipsis: true, align: c.align || 'left' }); x += c.w * scale; });
        doc.y = y + rowHeight;
      }
      // Text placed at a column leaves the cursor there; the next line starts at the margin.
      doc.x = 54;
      doc.moveDown(0.4);
    };

    const s = data.session;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(green).text('Gaeilgeoir Guides', { continued: true }).font('Helvetica').fillColor(muted).text('  ·  Class Portal');
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ink).text('Class report');
    doc.moveDown(0.2);
    para(`${s.classes}`, { color: muted });
    para(`${when(s.startedAt)}${s.endedAt ? ` to ${clock(s.endedAt)}` : ' (still running)'}  ·  ${s.minutes} ${s.minutes === 1 ? 'minute' : 'minutes'}`, { color: muted });

    heading('At a glance');
    const quizzes = data.checks.filter((c) => c.kind === 'quiz');
    const quizCorrect = quizzes.flatMap((q) => q.students).reduce((a, st) => a + st.correct, 0);
    const quizTotal = quizzes.flatMap((q) => q.students).reduce((a, st) => a + st.total, 0);
    const glance = [
      `${data.attendance.length} of ${s.rosterSize || data.attendance.length} students were in the room${data.absent.length ? `, ${data.absent.length} were not` : ''}.`,
      `${data.phrases.length} phrase${data.phrases.length === 1 ? '' : 's'} on screen; ${data.phrases.reduce((a, p) => a + p.passed, 0)} said, ${data.phrases.reduce((a, p) => a + p.skipped, 0)} skipped.`,
      quizTotal ? `Quiz answers: ${quizCorrect} of ${quizTotal} right (${Math.round((quizCorrect / quizTotal) * 100)}%).` : 'No quiz this class.',
      data.enjoyment.responded ? `Enjoyment: ${data.enjoyment.average} out of 10 from ${data.enjoyment.responded} student${data.enjoyment.responded === 1 ? '' : 's'}.` : 'No end-of-class rating yet.',
    ];
    for (const g of glance) para(`•  ${g}`);

    heading('Who was there');
    table([{ h: 'Student', w: 40 }, { h: 'Joined', w: 15 }, { h: 'Minutes', w: 12, align: 'right' }, { h: 'Said', w: 11, align: 'right' }, { h: 'Skipped', w: 11, align: 'right' }, { h: 'Quiz', w: 11, align: 'right' }],
      data.students.map((st) => { const att = data.attendance.find((a) => a.name === st.name); return [st.name, att ? clock(att.first) : '', st.minutes, st.passed, st.skipped, st.quizTotal ? `${st.quizCorrect}/${st.quizTotal}` : ''] ; }));
    if (data.absent.length) { para('Not in the room: ' + data.absent.join(', '), { color: muted }); }

    heading('Phrases');
    table([{ h: 'Phrase', w: 55 }, { h: 'Said', w: 12, align: 'right' }, { h: 'Skipped', w: 12, align: 'right' }, { h: 'Unfinished', w: 12, align: 'right' }, { h: 'Tries', w: 9, align: 'right' }],
      data.phrases.map((p) => [p.irish, p.passed, p.skipped, p.unfinished, p.attempts]));

    heading('Words the class is getting wrong');
    if (!data.hardWords.length) para('Nothing graded wrong or fair this class.', { color: muted });
    else table([{ h: 'Word', w: 40 }, { h: 'Wrong', w: 20, align: 'right' }, { h: 'Fair', w: 20, align: 'right' }, { h: 'Right', w: 20, align: 'right' }],
      data.hardWords.map((w) => [w.word, w.wrong, w.fair, w.right]));

    heading('Checks and quizzes');
    if (!data.checks.length) para('None asked this class.', { color: muted });
    for (const c of data.checks) {
      ensure(60);
      if (c.kind === 'understand') {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(`Do you understand: ${c.topic || 'this'}?`, { width });
        para(`${c.yes} of ${c.responded} said yes${c.notYet.length ? `. Not yet: ${c.notYet.join(', ')}` : ''}`, { color: muted });
      } else if (c.kind === 'rating' || c.kind === 'enjoy') {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(c.kind === 'enjoy' ? 'How much did you enjoy the class?' : `Rate your understanding: ${c.topic || ''}`, { width });
        para(`Average ${c.average ?? '-'} out of 10 from ${c.responded}${c.low.length ? `. Five or under: ${c.low.join(', ')}` : ''}`, { color: muted });
      } else {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(`Pop quiz${c.topic ? `: ${c.topic}` : ''}`, { width });
        para(`${c.finished} of ${c.responded} finished all ${c.total} questions`, { color: muted });
        table([{ h: 'Question', w: 46 }, { h: 'Answer', w: 20 }, { h: 'Right', w: 10, align: 'right' }, { h: 'Common wrong answers', w: 24 }],
          c.questions.map((q) => [q.q, q.answer, `${q.correct}/${q.answered}`, q.commonWrong.join(', ')]));
        table([{ h: 'Student', w: 60 }, { h: 'Score', w: 40, align: 'right' }], c.students.map((st) => [st.name, `${st.correct} of ${st.total}`]));
      }
      doc.moveDown(0.5);
    }

    heading('How the class was');
    if (!data.enjoyment.responded) para('No ratings yet.', { color: muted });
    else {
      para(`Average ${data.enjoyment.average} out of 10 from ${data.enjoyment.responded} student${data.enjoyment.responded === 1 ? '' : 's'}.`);
      para('Scores 1 to 10: ' + data.enjoyment.distribution.map((n, i) => `${i + 1}: ${n}`).join('   '), { color: muted });
    }
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text('Ideas for improving the class');
    if (!data.ideas.length) para('None given.', { color: muted });
    for (const i of data.ideas) { ensure(30); para(`${i.name}: ${i.text}`); }

    doc.moveDown(1);
    para(`Report made ${when(new Date().toISOString())}.`, { color: muted });
    doc.end();
  });
}
