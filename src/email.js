import nodemailer from 'nodemailer';
import { config } from './config.js';
import { getEmailConfig, getSetting } from './settings.js';
import { one, query } from './db.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

/* What every email from the portal looks like.
   ------------------------------------------------------------------
   Written for mail clients rather than for browsers, which is a different and
   older craft: tables for layout, every style inline, no flexbox, no grid, no
   stylesheet. Anything cleverer than this is fine in Gmail and broken in
   Outlook, and Outlook is where half of a staffroom reads its mail.

   The changes from what was here before are all about it reading as a message
   from a person rather than a mailshot:

   The heavy green band across the top is gone. A colour slab is what marketing
   email looks like, and these are notes to a student about their own work. The
   name sits quietly at the top with a thin rule under it.

   There is a preheader now: the hidden line a mail client shows in the inbox
   list beside the subject. Without one Gmail pulls the first words of the body,
   which is why these appeared in the list as "Hi Kacey, Just a reminder that".
   A sentence chosen for that slot is the difference between an email that looks
   considered and one that looks automated.

   One call to action, not a link in the body and a button underneath saying the
   same thing. And a real footer, with the off switch in it. */
function layout({ title, preheader = '', body, buttonText, buttonUrl, footnote = '' }) {
  const ink = '#1f2d1c';
  const muted = '#5c6b59';
  const line = '#e3e9df';
  const brand = '#3f8f2b';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f2;-webkit-font-smoothing:antialiased">
<!-- The line the inbox shows beside the subject, then enough blank characters
     that the body text underneath is not dragged in after it. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader || title)}${'&#8199;&#65279;&#847; '.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f2">
<tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${line};border-radius:12px">

<tr><td style="padding:24px 30px 0">
  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;color:${brand};letter-spacing:-.01em">Gaeilgeoir Guides</span>
  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:${muted}"> · Class Portal</span>
</td></tr>
<tr><td style="padding:16px 30px 0"><div style="height:1px;background:${line};line-height:1px;font-size:0">&nbsp;</div></td></tr>

<tr><td style="padding:24px 30px 0">
  <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:21px;line-height:1.3;font-weight:700;color:${ink};letter-spacing:-.01em">${escapeHtml(title)}</h1>
</td></tr>

<tr><td style="padding:14px 30px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.65;color:${ink}">${body}</td></tr>

${buttonUrl ? `<tr><td style="padding:24px 30px 0">
  <!-- A table rather than a padded anchor, because Outlook drops padding on an
       inline link and the button collapses to underlined text. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" bgcolor="${brand}" style="border-radius:8px">
      <a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(buttonText || 'Open the portal')}</a>
    </td>
  </tr></table>
</td></tr>` : ''}

${footnote ? `<tr><td style="padding:22px 30px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:${muted}">${footnote}</td></tr>` : ''}

<tr><td style="padding:26px 30px 24px">
  <div style="height:1px;background:${line};line-height:1px;font-size:0">&nbsp;</div>
  <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:${muted}">
    Gaeilgeoir Guides Class Portal<br>
    <a href="${escapeHtml(config.appUrl)}" style="color:${muted}">${escapeHtml(String(config.appUrl).replace(/^https?:\/\//, ''))}</a>
  </p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/* Somebody's writing, turned into paragraphs.
   ------------------------------------------------------------------
   Handles a literal backslash-n as well as a real line break. The reminder
   templates were seeded through a single-quoted SQL string, where \n is two
   characters rather than a newline, so every deadline reminder ever sent showed
   "Hi Kacey,\n\nJust a reminder" to the student. The stored templates are
   repaired by migration; this means a template typed with \n by hand, which is a
   very easy thing to do in a text box, comes out right as well. */
function paragraphsFrom(text) {
  return String(text ?? '')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
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

/* A ceiling on the day, whatever the cause.
   ------------------------------------------------------------------
   The pace limits what one person receives. It does nothing about the total,
   because a hundred people receiving one message each is a hundred messages, and
   an allowance is spent by the total.

   This is deliberately a backstop rather than a policy. It is set well above a
   normal day, so reaching it means something is wrong rather than busy, and what
   it holds back is chosen accordingly: board notices and announcements stop,
   while deadline reminders and anything somebody is waiting on keep going. A
   ceiling that silenced a homework reminder would have traded a smaller problem
   for a worse one.

   Counted over a rolling day rather than to midnight, so a burst at eleven at
   night is still covered at one in the morning. */
const CEILING_EXEMPT = new Set(['transactional', 'deadline']);

async function overDailyCeiling(priority) {
  if (CEILING_EXEMPT.has(priority)) return null;
  const limit = Number(config.emailDailyCap);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const today = await one(
    `SELECT count(*)::int count FROM email_sends
     WHERE status IN ('sent','simulated') AND created_at > now() - interval '24 hours'`,
  );
  if ((today?.count ?? 0) < limit) return null;
  console.warn(`Email ceiling reached: ${today.count} sent in 24 hours, limit ${limit}. Holding notices and announcements. Reminders and password resets are still going out.`);
  return `${today.count} emails have gone out in the last 24 hours, which is over the limit of ${limit}`;
}

async function pacingProblem({ to, priority }) {
  /* A pause set by hand, for a day when the answer is simply "not today". Read
     every time rather than cached, so lifting it takes effect at once. */
  const paused = await getSetting('emailPause', {});
  if (paused?.until && new Date(paused.until).getTime() > Date.now() && !NEVER_HELD.has(priority)) {
    return `sending is paused until ${paused.until}${paused.reason ? ` (${paused.reason})` : ''}`;
  }
  const ceiling = await overDailyCeiling(priority);
  if (ceiling) return ceiling;

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
    html: layout({
      title: 'Your Class Portal login',
      preheader: 'Your account is ready. Your temporary password is inside.',
      body, buttonText: 'Sign in and set your password', buttonUrl: loginUrl,
    }),
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
  return sendEmail({
    to: student.email,
    subject,
    text: body,
    html: layout({
      title: subject,
      preheader: String(body).replace(/\s+/g, ' ').slice(0, 90),
      body: paragraphsFrom(body),
      buttonText: 'Open the Class Portal',
      buttonUrl: config.appUrl,
    }),
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
    html: layout({
      title: 'Reset your password',
      preheader: 'Use the link inside to choose a new one. It expires in an hour.',
      body, buttonText: 'Choose a new password', buttonUrl: url,
    }),
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
    html: layout({
      title: 'Password changed',
      preheader: 'If this was not you, contact us straight away.',
      body,
    }),
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

/* Every notice says how to stop getting them. Somebody who cannot find the
   switch uses the one their mail client provides instead, and a spam complaint
   costs the sending domain far more than an unsubscribe ever does. */
const OFF_SWITCH_HTML = 'You can turn these off under your name in the portal, in Notifications.';
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
      preheader: lead,
      body: `<p style="margin:0 0 16px;font-size:13px;color:#5c6b59">${escapeHtml(lead)}</p>`
        + paragraphsFrom(shown)
        + (trimmed ? '<p style="margin:0 0 14px;color:#5c6b59"><em>There is more in the post itself.</em></p>' : ''),
      buttonText: 'Read it and reply',
      buttonUrl: config.appUrl,
      footnote: OFF_SWITCH_HTML,
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
      preheader: lead,
      body: `<p style="margin:0 0 14px">${escapeHtml(lead)}</p>`
        + `<p style="margin:0;font-size:13px;color:#5c6b59">On: ${escapeHtml(thread.title)}</p>`,
      buttonText: 'Read it and reply',
      buttonUrl: config.appUrl,
      footnote: OFF_SWITCH_HTML,
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
  const plain = fill(template.body).replace(/\\r\\n|\\n|\\r/g, '\n');
  /* The link is the button. A template that also writes it out inline leaves the
     same address twice, once as a raw URL with a uuid in it, which is what the
     reminder looked like. Taken out of the body rather than out of the template,
     so somebody who wants it inline can still put it there and it is the line
     naming it that goes. */
  const withoutDuplicateLink = plain
    .split('\n')
    .filter((line) => !line.includes(values.assignment_link))
    .join('\n')
    .trim();
  return sendEmail({
    to: student.email,
    subject,
    text: `${withoutDuplicateLink}\n\n${values.assignment_link}`,
    html: layout({
      title: subject,
      preheader: `Due ${values.deadline_time}.`,
      body: paragraphsFrom(withoutDuplicateLink),
      buttonText: 'Open your homework',
      buttonUrl: values.assignment_link,
    }),
    priority: 'deadline',
    metadata: { type: 'deadline_reminder', assignmentId: assignment.id, studentId: student.id },
  });
}
