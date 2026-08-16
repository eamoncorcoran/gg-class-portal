import cron from 'node-cron';
import { config } from './config.js';
import { query, one } from './db.js';
import { getSetting } from './settings.js';
import { sendDeadlineReminder } from './email.js';

const thresholds = [
  { key: 'tomorrow', seconds: 24 * 60 * 60 },
  { key: 'twoHours', seconds: 2 * 60 * 60 },
  { key: 'thirtyMinutes', seconds: 30 * 60 },
];

async function candidates(seconds) {
  const result = await query(
    `SELECT a.id assignment_id, a.title, a.deadline_at, c.timezone,
            u.id student_id, u.name, u.email
     FROM assignments a
     JOIN classes c ON c.id=a.class_id
     JOIN class_students cs ON cs.class_id=a.class_id AND cs.active=true
     JOIN users u ON u.id=cs.student_id AND u.active=true AND u.withdrawn_at IS NULL
     LEFT JOIN homework_submissions hs ON hs.assignment_id=a.id AND hs.student_id=u.id
     WHERE a.status='published' AND a.reminders_enabled=true
       AND COALESCE(hs.status,'draft') <> 'submitted' AND COALESCE(hs.status,'draft') <> 'returned'
       AND a.deadline_at BETWEEN now() + ($1::text || ' seconds')::interval - interval '6 minutes'
                           AND now() + ($1::text || ' seconds')::interval + interval '6 minutes'`,
    [seconds],
  );
  return result.rows;
}

export async function runReminderCycle() {
  const settings = await getSetting('reminders', { enabled: true });
  if (settings.enabled === false) return;
  for (const threshold of thresholds) {
    const template = settings[threshold.key];
    if (!template || template.enabled === false) continue;
    const rows = await candidates(threshold.seconds);
    for (const row of rows) {
      const existing = await one(
        `SELECT id FROM email_deliveries WHERE user_id=$1 AND assignment_id=$2 AND template_key=$3`,
        [row.student_id, row.assignment_id, threshold.key],
      );
      if (existing) continue;
      let status = 'failed';
      let providerId = null;
      let error = null;
      try {
        const result = await sendDeadlineReminder({
          student: { id: row.student_id, name: row.name, email: row.email },
          assignment: { id: row.assignment_id, title: row.title, deadline_at: row.deadline_at, timezone: row.timezone },
          template,
        });
        status = result.simulated ? 'simulated' : 'sent';
        providerId = result.id;
      } catch (sendError) {
        error = sendError.message;
        console.error('Reminder delivery failed', sendError);
      }
      await query(
        `INSERT INTO email_deliveries(user_id,assignment_id,template_key,recipient,status,provider_id,error,sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $5 IN ('sent','simulated') THEN now() ELSE NULL END)
         ON CONFLICT (user_id,assignment_id,template_key) DO NOTHING`,
        [row.student_id, row.assignment_id, threshold.key, row.email, status, providerId, error],
      );
    }
  }
}

export function startReminderScheduler() {
  cron.schedule(config.reminderCron, () => runReminderCycle().catch((error) => console.error('Reminder cycle failed', error)), { noOverlap: true });
}
