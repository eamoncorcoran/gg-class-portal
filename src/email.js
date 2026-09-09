import nodemailer from 'nodemailer';
import { config } from './config.js';
import { getEmailConfig, getSetting } from './settings.js';
import { one, query } from './db.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function layout({ title, body, buttonText, buttonUrl }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f7f3;font-family:Arial,sans-serif;color:#243322">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 16px">
  <table width="100%" style="max-width:600px;background:#fff;border:1px solid #dfe8da;border-radius:14px;overflow:hidden" cellpadding="0" cellspacing="0">
  <tr><td style="padding:22px 28px;background:#50AF37;color:#fff;font-size:19px;font-weight:700;letter-spacing:-.01em">Gaeilgeoir Guides<span style="opacity:.72;font-weight:500"> · Class Portal</span></td></tr>
  <tr><td style="padding:30px 28px"><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1><div style="font-size:15px;line-height:1.65;color:#465643">${body}</div>
  ${buttonUrl ? `<p style="margin:24px 0 0"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#50AF37;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${escapeHtml(buttonText || 'Open')}</a></p>` : ''}
  </td></tr><tr><td style="padding:18px 28px;background:#f8fbf6;color:#748171;font-size:12px">Gaeilgeoir Guides Class Portal. If you were not expecting this email, you can ignore it.</td></tr>
  </table></td></tr></table></body></html>`;
}

/* What may be sent, and how often.
   ------------------------------------------------------------------
   Every message in the portal goes through sendEmail, so the pacing lives here
   rather than at the twenty places that call it. A rule enforced at each caller
   is a rule somebody forgets at the twenty-first.

   Four kinds of message, and they are paced differently because they are not
   the same kind of thing:

   transactional  Somebody is sitting there waiting for it right now: a password
                  reset, an invitation, the button a teacher just pressed.
                  Never held back. Holding one of these back does not save
                  anybody an email, it produces a locked-out student and a
                  support message.

   deadline       Homework and check-in reminders. Exempt from the hourly pace,
                  because a reminder that arrives an hour late about something
                  due at midnight is not a reminder.

   announcement   A post the teacher put out. Also exempt from the pace: it was
                  written to be read, and it is one message, not a stream.

   notice         Everything the board generates on its own: a reply, somebody
                  else's post. This is the traffic that multiplies, so this is
                  what the hour applies to.

   The default is `notice`, which is the cautious end. A message added later and
   never categorised gets paced rather than escaping the pacing. */
const NEVER_HELD = new Set(['transactional']);
const PACED = new Set(['notice']);
const PACE_INTERVAL = "interval '1 hour'";

async function pacingProblem({ to, priority }) {
  /* A pause set by hand, for a day when the answer is simply "not today". Read
     every time rather than cached, so lifting it takes effect at once. */
  const paused = await getSetting('emailPause', {});
  if (paused?.until && new Date(paused.until).getTime() > Date.now() && !NEVER_HELD.has(priority)) {
    return `sending is paused until ${paused.until}${paused.reason ? ` (${paused.reason})` : ''}`;
  }
  if (!PACED.has(priority)) return null;

  const recent = await one(
    `SELECT created_at FROM email_sends
     WHERE recipient=$1 AND status IN ('sent','simulated')
       AND created_at > now() - ${PACE_INTERVAL}
     ORDER BY created_at DESC LIMIT 1`,
    [String(to).toLowerCase()],
  );
  return recent ? 'one message an hour is the pace for board notices' : null;
}

async function recordSend({ to, priority, subject, status, reason }) {
  await query(
    `INSERT INTO email_sends(recipient,priority,subject,status,reason) VALUES ($1,$2,$3,$4,$5)`,
    [String(to).toLowerCase(), priority, String(subject || '').slice(0, 300), status, reason || null],
  ).catch((error) => console.error(`Could not record an email send: ${error.message}`));
}

export async function sendEmail({ to, subject, text, html, attachments = [], metadata = {}, priority = 'notice' }) {
  const held = await pacingProblem({ to, priority });
  if (held) {
    await recordSend({ to, priority, subject, status: 'suppressed', reason: held });
    /* Answered rather than thrown. A held message is the system working, and a
       caller that treats it as a failure would retry it. */
    return { suppressed: true, reason: held };
  }
  const email = await getEmailConfig();
  const message = {
    to,
    subject,
    text,
    html,
    from: `${email.fromName} <${email.fromAddress}>`,
    replyTo: email.replyTo,
    ...(attachments.length ? { attachments } : {}),
  };
  if (email.provider === 'ghl_webhook') {
    if (!email.webhookUrl) throw new Error('GHL email webhook is not configured.');
    /* A webhook forwards a message; it has nowhere to put a file. Saying so is
       better than posting the JSON and letting the attachment vanish. */
    if (attachments.length) throw new Error('The GHL webhook cannot carry attachments. Use SMTP for backup emails.');
    const response = await fetch(email.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, metadata }),
    });
    if (!response.ok) throw new Error(`GHL webhook returned ${response.status}`);
    await recordSend({ to, priority, subject, status: 'sent' });
    return { provider: 'ghl_webhook', id: response.headers.get('x-request-id') || null };
  }
  if (email.provider === 'smtp') {
    const transporter = nodemailer.createTransport({
      host: email.smtpHost,
      port: email.smtpPort,
      secure: email.smtpSecure,
      auth: email.smtpUser ? { user: email.smtpUser, pass: email.smtpPassword } : undefined,
    });
    const result = await transporter.sendMail(message);
    await recordSend({ to, priority, subject, status: 'sent' });
    return { provider: 'smtp', id: result.messageId };
  }
  console.log('\n--- EMAIL SIMULATION ---\n', { ...message, html: '[html omitted]', metadata }, '\n------------------------\n');
  await recordSend({ to, priority, subject, status: 'simulated' });
  return { provider: 'console', id: `sim-${Date.now()}`, simulated: true };
}

export async function sendStudentInvite({ student, temporaryPassword }) {
  const loginUrl = config.appUrl;
  const firstName = student.name.split(' ')[0];
  // The address and password are repeated as plain text below the button, because
  // plenty of mail clients block the styled block and some students will be
  // reading this on a phone that will not let them copy from a button.
  const body = `<p>Hi ${escapeHtml(firstName)},</p>
  <p>Your Gaeilgeoir Guides Class Portal account is ready. This is where you will find your weekly check-in, your homework, and the corrections and feedback I send back to you.</p>
  <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:20px 0;border:1px solid #dfe8da;border-radius:10px;background:#f8fbf6">
    <tr><td style="padding:16px 18px;font-size:14px;line-height:1.8;color:#243322">
      <strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#748171">Sign in at</strong>
      <a href="${escapeHtml(loginUrl)}" style="color:#3f922c;font-weight:700;word-break:break-all">${escapeHtml(loginUrl)}</a>
      <div style="height:10px"></div>
      <strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#748171">Email</strong>
      ${escapeHtml(student.email)}
      <div style="height:10px"></div>
      <strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#748171">Temporary password</strong>
      <code style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:700;letter-spacing:.02em;color:#243322">${escapeHtml(temporaryPassword)}</code>
    </td></tr>
  </table>
  <p>You will be asked to choose your own password the first time you sign in, so you do not need to keep this one. Stay signed in on your own phone or laptop and you will not have to type it again.</p>
  <p>Tá Gaeilge bhriste níos fearr ná Béarla cliste. See you in class.</p>`;
  return sendEmail({
    to: student.email,
    subject: 'Your Gaeilgeoir Guides Class Portal login',
    text: [
      `Hi ${firstName},`,
      '',
      'Your Gaeilgeoir Guides Class Portal account is ready.',
      '',
      `Sign in at: ${loginUrl}`,
      `Email: ${student.email}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      'You will be asked to choose your own password the first time you sign in.',
      '',
      'Tá Gaeilge bhriste níos fearr ná Béarla cliste. See you in class.',
    ].join('\n'),
    html: layout({ title: 'Your Class Portal login', body, buttonText: 'Sign in and set your password', buttonUrl: loginUrl }),
    priority: 'transactional',
    metadata: { type: 'student_invite', studentId: student.id },
  });
}

/**
 * A one-off nudge to one student about one missing piece of work.
 *
 * Deliberately separate from the automatic deadline sequence: that one fires on
 * a schedule and never repeats, this one is a teacher deciding to reach out, and
 * it can be sent whenever and edited before it goes.
 */
export async function sendNudge({ student, subject, body, metadata = {} }) {
  const htmlBody = String(body).split('\n').map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br>')).join('');
  return sendEmail({
    to: student.email,
    subject,
    text: body,
    html: layout({ title: subject, body: htmlBody, buttonText: 'Open the Class Portal', buttonUrl: config.appUrl }),
    priority: 'transactional',
    metadata: { type: 'nudge', studentId: student.id, ...metadata },
  });
}

export async function sendPasswordReset({ user, token }) {
  const url = `${config.appUrl}/?reset=${encodeURIComponent(token)}`;
  const body = `<p>Hi ${escapeHtml(user.name.split(' ')[0])},</p><p>Use the button below to choose a new password. This link expires in one hour.</p><p>If you did not request this, you can ignore this email.</p>`;
  return sendEmail({
    to: user.email,
    subject: 'Reset your Gaeilgeoir Guides password',
    text: `Reset your password: ${url}`,
    html: layout({ title: 'Reset your password', body, buttonText: 'Choose a new password', buttonUrl: url }),
    priority: 'transactional',
    metadata: { type: 'password_reset', userId: user.id },
  });
}

export async function sendPasswordChanged({ user }) {
  const body = `<p>Hi ${escapeHtml(user.name.split(' ')[0])},</p><p>Your Gaeilgeoir Guides password has been changed successfully.</p><p>If this was not you, contact support immediately.</p>`;
  return sendEmail({
    to: user.email,
    subject: 'Your password was changed',
    text: 'Your Gaeilgeoir Guides password was changed. Contact support if this was not you.',
    html: layout({ title: 'Password changed', body }),
    priority: 'transactional',
    metadata: { type: 'password_changed', userId: user.id },
  });
}

/* What a board notice looks like.
   ------------------------------------------------------------------
   The writing itself goes in the email rather than a line saying there is some
   to read. If it is worth telling somebody about it is worth them being able to
   read it where they are; a notice that only says "there is a new post" makes
   somebody sign in to discover it did not concern them, and after that they
   stop opening the notices.

   Long ones are cut, because an email is not where a thousand words are read,
   and the button goes to the board where the whole thing is. */
const MAX_QUOTED = 900;

function quoted(text) {
  const full = String(text || '');
  if (full.length <= MAX_QUOTED) return { shown: full, trimmed: false };
  const head = full.slice(0, MAX_QUOTED);
  const cut = Math.max(head.lastIndexOf('\n'), head.lastIndexOf('. ') + 1);
  return { shown: `${head.slice(0, cut > 0 ? cut : MAX_QUOTED).trimEnd()}…`, trimmed: true };
}

const paragraphs = (text) => String(text).split('\n')
  .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br>')).join('');

/* Every notice says how to stop getting them. Somebody who cannot find the
   switch uses the one their mail client provides instead, and a spam complaint
   costs the sending domain far more than an unsubscribe ever does. */
const OFF_SWITCH_HTML = '<p style="color:#6b7280;font-size:12px;margin-top:22px">'
  + 'You can turn these off under your name in the top right of the portal, in Notifications.</p>';
const OFF_SWITCH_TEXT = '\n\nTo stop these, open the portal and turn off notifications under your name in the top right.';

/** A new post on the class board. */
export async function sendBoardPostNotice({ student, thread }) {
  const author = thread.author_name || 'Gaeilgeoir Guides';
  const teacher = thread.author_role === 'admin';
  const { shown, trimmed } = quoted(thread.body);
  const lead = teacher
    ? `${author} posted on the class board.`
    : `${author} posted a question on the class board.`;

  const text = [lead, '', thread.title, '', shown,
    trimmed ? '\nThere is more in the post itself.' : '',
    '', `Read it and reply: ${config.appUrl}`, OFF_SWITCH_TEXT].join('\n');

  return sendEmail({
    to: student.email,
    subject: thread.title,
    text,
    html: layout({
      title: thread.title,
      body: `<p style="color:#6b7280;font-size:13px;margin:0 0 16px">${escapeHtml(lead)}</p>`
        + paragraphs(shown)
        + (trimmed ? '<p><em>There is more in the post itself.</em></p>' : '')
        + OFF_SWITCH_HTML,
      buttonText: 'Read it and reply',
      buttonUrl: config.appUrl,
    }),
    /* A post the teacher put out was written to be read and is one message, so
       it is not held behind the hourly pace. A student's post is board traffic
       like any other and is. */
    priority: teacher ? 'announcement' : 'notice',
    metadata: { type: 'board_new_post', threadId: thread.id, studentId: student.id },
  });
}

/* Somebody has replied in a conversation this person is part of.
   ------------------------------------------------------------------
   Deliberately says nothing about what was written. A reply is one turn in a
   conversation that is still going, and quoting it into an email means the same
   words land in two places, out of order, with the email version already stale
   by the time it is read. It also puts one student's words in front of another
   student in a channel neither of them chose.

   So this says that there is something to read, and where. The reading happens
   on the board, where the rest of the conversation is. */
export async function sendBoardReplyNotice({ student, thread, comment }) {
  const answeringTheirComment = Boolean(comment?.parent_id);
  const lead = answeringTheirComment
    ? 'Somebody has replied to a comment on the class board.'
    : 'Somebody has replied to a post on the class board.';

  const text = [
    lead, '', `On: ${thread.title}`, '',
    `Read it and reply: ${config.appUrl}`, OFF_SWITCH_TEXT,
  ].join('\n');

  return sendEmail({
    to: student.email,
    subject: `New reply on “${thread.title}”`,
    text,
    html: layout({
      title: 'There is a new reply',
      body: `<p>${escapeHtml(lead)}</p><p style="color:#6b7280;font-size:13px">On: ${escapeHtml(thread.title)}</p>${OFF_SWITCH_HTML}`,
      buttonText: 'Read it and reply',
      buttonUrl: config.appUrl,
    }),
    priority: 'notice',
    metadata: { type: 'board_new_comment', threadId: thread.id, postId: comment.id, studentId: student.id },
  });
}

export async function sendDeadlineReminder({ student, assignment, template }) {
  const values = {
    first_name: student.name.split(' ')[0],
    assignment_title: assignment.title,
    deadline_time: new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short', timeZone: assignment.timezone || config.defaultTimezone }).format(new Date(assignment.deadline_at)),
    assignment_link: `${config.appUrl}/?assignment=${assignment.id}`,
  };
  const fill = (value) => String(value || '').replace(/{{\s*([^}]+)\s*}}/g, (_, key) => values[key.trim()] ?? '');
  const subject = fill(template.subject);
  const plain = fill(template.body);
  const htmlBody = plain.split('\n').map((line) => line ? `<p>${escapeHtml(line)}</p>` : '<br>').join('');
  return sendEmail({
    to: student.email,
    subject,
    text: plain,
    html: layout({ title: subject, body: htmlBody, buttonText: 'Continue work', buttonUrl: values.assignment_link }),
    priority: 'deadline',
    metadata: { type: 'deadline_reminder', assignmentId: assignment.id, studentId: student.id },
  });
}
