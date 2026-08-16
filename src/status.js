export function effectiveDeadline(assignment) {
  const deadline = new Date(assignment.deadline_at || assignment.deadlineAt).getTime();
  const reopened = assignment.reopened_until || assignment.reopenedUntil;
  return reopened && new Date(reopened).getTime() > deadline ? new Date(reopened).getTime() : deadline;
}

export function attendanceStatus(attendance) {
  return attendance?.status === 'live'
    ? { tone: 'green', icon: 'camera', label: 'Attended live' }
    : { tone: 'red', icon: 'x', label: 'Did not attend live' };
}

export function homeworkStatus({ submission, assignment, now = Date.now() }) {
  if (submission?.status === 'returned') return { tone: 'green', icon: 'book', label: 'Feedback sent' };
  if (submission?.status === 'submitted') return { tone: 'orange', icon: 'book', label: 'Submitted' };
  if (now > effectiveDeadline(assignment)) return { tone: 'red', icon: 'x', label: 'Past deadline' };
  return { tone: 'grey', icon: 'book', label: 'Not submitted' };
}

export function checkinStatus({ checkin, week, now = Date.now() }) {
  if (checkin?.status === 'returned') return { tone: 'green', icon: 'talk', label: 'Feedback sent' };
  if (checkin?.status === 'submitted') return { tone: 'orange', icon: 'talk', label: 'Submitted' };
  if (now > new Date(week.checkin_due_at || week.checkinDueAt).getTime()) {
    return { tone: 'red', icon: 'x', label: 'Past deadline' };
  }
  return { tone: 'grey', icon: 'talk', label: 'Not submitted' };
}

export function parseAttendanceMinutes(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) {
    const hours = Number(clock[1] || 0);
    const minutes = Number(clock[2] || 0);
    const seconds = Number(clock[3] || 0);
    return Math.max(0, Math.round(hours * 60 + minutes + seconds / 60));
  }
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/i)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute)/i)?.[1] || 0);
  if (hours || minutes) return Math.max(0, Math.round(hours * 60 + minutes));
  return Math.max(0, Number.parseInt(text, 10) || 0);
}

export const MILESTONES = [1, 3, 5, 10, 15, 20, 30, 40, 50, 75, 100];

/* What the student has built up, so the work has a shape beyond the next
   deadline. Computed here rather than in the browser so the counting rule is
   written down once and can be tested. */
export function studentProgress({ checkins = [], homework = [] } = {}) {
  const done = (rows) => rows.filter((row) => row.status && row.status !== 'draft').length;
  const checkinsDone = done(checkins);
  const homeworkDone = done(homework);
  const total = checkinsDone + homeworkDone;
  const next = MILESTONES.find((mark) => mark > total) ?? null;
  const previous = [...MILESTONES].reverse().find((mark) => mark <= total) ?? 0;
  return {
    checkins: checkinsDone,
    homework: homeworkDone,
    total,
    next,
    toNext: next ? next - total : 0,
    towards: next ? Math.round(((total - previous) / (next - previous)) * 100) : 100,
    justHit: MILESTONES.includes(total) ? total : null,
  };
}
