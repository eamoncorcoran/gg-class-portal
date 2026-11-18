import { one, query } from './db.js';
import { askPastQuestions } from './pqproxy.js';
import { audit } from './audit.js';

/**
 * Homework set from past exam questions, marked and handed back on the spot.
 *
 * A listening or a reading comprehension has a marking scheme, and the past
 * papers section already marks against it the moment somebody presses Check:
 * meaning earns the marks, and a spelling or grammar slip costs nothing if the
 * answer can be made out. Homework set from the same questions went a longer
 * way round. It was marked in the student's browser, then held as "submitted"
 * while a draft of Irish corrections was written for the teacher to review,
 * and that draft corrected every slip in every short answer, which is the
 * opposite of how the paper is marked.
 *
 * Now, when every question in the homework is one the scheme can mark, the
 * server marks it and returns it in the same breath: the student sees each
 * answer's marks, the expected answer and a line of feedback, exactly as on
 * the past papers, and nothing waits for review. No corrections are drafted.
 *
 * The marking is done here, on the server, from the answers that were typed,
 * not taken from what the browser says the marks were.
 */

/* Which past questions the scheme can mark on its own: the listening sections
   and the reading comprehensions, and the short-answer questions of the other
   subjects. A composition or a poetry answer is not one of them. */
const SUBJECT_ID = /^[a-z][a-z0-9-]*\.(h|o|f|c)\./;
export const markable = (pqId) => /^(aural-|reading-comprehension-)/.test(String(pqId)) || SUBJECT_ID.test(String(pqId));
export const allMarkable = (pqIds) => Array.isArray(pqIds) && pqIds.length > 0 && pqIds.every(markable);

const VERDICTS = new Set(['correct', 'partial', 'wrong', 'blank']);
const whole = (value) => Math.max(0, Math.min(1000, Math.round(Number(value) || 0)));
const tidy = (result) => {
  const max = whole(result.max);
  return {
    key: String(result.key).slice(0, 80),
    verdict: VERDICTS.has(result.verdict) ? result.verdict : 'wrong',
    awarded: Math.min(whole(result.awarded), max),
    max,
    expected: String(result.expected ?? '').slice(0, 4000),
    feedback: String(result.feedback ?? '').slice(0, 4000),
  };
};

/**
 * Marks every markable question of a homework from what was typed.
 * `answers` is { pqId: { answerSpace: text } }. Throws if the marker cannot be
 * reached, so the caller can leave the work as handed in and try again later.
 */
export async function markPastQuestions(pqIds, answers) {
  const ids = pqIds.filter(markable);
  const marked = await Promise.all(ids.map(async (id) => {
    const out = await askPastQuestions('/api/check', { id, answers: answers?.[id] || {} });
    return [id, (Array.isArray(out.results) ? out.results : []).map(tidy)];
  }));
  const results = Object.fromEntries(marked);
  const all = Object.values(results).flat();
  return {
    results,
    got: all.reduce((sum, r) => sum + r.awarded, 0),
    total: all.reduce((sum, r) => sum + r.max, 0),
  };
}

/* What the tracker and the review show as the feedback. The detail (each
   answer, its marks, the expected answer) is on the paper itself. */
export const summary = ({ got, total }) => (
  `Marked against the official marking scheme: ${got} of ${total} marks.\n\n`
  + 'Marks are given for meaning, as in the exam: a spelling or grammar slip does not lose a mark when the answer can be made out. '
  + 'Open the homework to see each answer, the marks it got and the answer the scheme expects.'
);

/**
 * Writes the marks onto a submission and returns it to the student.
 * `seen` is true when the student is looking at it as it happens (they have
 * just handed in), so it does not also show up as unread feedback.
 */
export async function returnMarked({ submissionId, answers, marks, seen = false, actorId = null }) {
  const kept = { answers, results: marks.results, got: marks.got, total: marks.total };
  const row = await one(
    `UPDATE homework_submissions SET
       pq_result=$2::jsonb,
       ai_corrections=NULL, ai_general_feedback=NULL,
       teacher_corrections=$3, teacher_general_feedback=NULL,
       ai_score=$4, ai_max=$5, teacher_score=$4, teacher_max=$5, ai_marked_at=now(),
       status='returned', feedback_state='returned', feedback_returned_at=now(),
       feedback_read_at=CASE WHEN $6 THEN now() ELSE NULL END, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [submissionId, JSON.stringify(kept), summary(marks), marks.got, marks.total, seen],
  );
  await audit({ actorId, action: 'homework.marked_and_returned', entityType: 'homework_submission', entityId: submissionId, metadata: { got: marks.got, total: marks.total } });
  return row;
}

/**
 * Anything handed in and still waiting, on homework the scheme can mark by
 * itself: marked again from the answers that were typed, and returned.
 *
 * This is how work handed in before this existed gets its marks, and how a
 * hand-in is finished when the marker could not be reached at the time.
 */
export async function returnWaitingHomework() {
  const waiting = await query(
    `SELECT hs.id, hs.student_id, hs.pq_result, a.pq_ids, a.title
     FROM homework_submissions hs JOIN assignments a ON a.id=hs.assignment_id
     WHERE hs.status='submitted' AND cardinality(a.pq_ids) > 0 AND a.status <> 'archived'
     ORDER BY hs.submitted_at`,
  );
  let returned = 0;
  for (const row of waiting.rows) {
    if (!allMarkable(row.pq_ids)) continue;
    const answers = row.pq_result?.answers || {};
    // Nothing typed was kept, so there is nothing to mark from: left for the teacher.
    if (!Object.values(answers).some((spaces) => Object.values(spaces || {}).some((text) => String(text).trim()))) continue;
    try {
      const before = row.pq_result?.total ? `${row.pq_result.got}/${row.pq_result.total}` : 'unmarked';
      const marks = await markPastQuestions(row.pq_ids, answers);
      if (!marks.total) continue;
      await returnMarked({ submissionId: row.id, answers, marks });
      console.log(`Past question homework marked and returned: "${row.title}" ${before} -> ${marks.got}/${marks.total}`);
      returned += 1;
    } catch (error) {
      console.error('Marking waiting homework failed', row.id, error.message);
    }
  }
  return { returned };
}
