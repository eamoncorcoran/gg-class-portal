import nodemailer from 'nodemailer';
import { config } from './config.js';
import { getEmailConfig } from './settings.js';

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

export async function sendEmail({ to, subject, text, html, metadata = {} }) {
  const email = await getEmailConfig();
  const message = {
    to,
    subject,
    text,
    html,
    from: `${email.fromName} <${email.fromAddress}>`,
    replyTo: email.replyTo,
  };
  if (email.provider === 'ghl_webhook') {
    if (!email.webhookUrl) throw new Error('GHL email webhook is not configured.');
    const response = await fetch(email.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, metadata }),
    });
    if (!response.ok) throw new Error(`GHL webhook returned ${response.status}`);
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
    return { provider: 'smtp', id: result.messageId };
  }
  console.log('\n--- EMAIL SIMULATION ---\n', { ...message, html: '[html omitted]', metadata }, '\n------------------------\n');
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
    metadata: { type: 'password_changed', userId: user.id },
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
    metadata: { type: 'deadline_reminder', assignmentId: assignment.id, studentId: student.id },
  });
}
