/* The first administrator, without a terminal.
   ------------------------------------------------------------------
   A freshly deployed portal has an empty users table, so there is nobody who
   can sign in and no way in to create anybody. The usual answer is to open a
   shell on the server and run create-admin, which assumes a shell — and on a
   managed host that is a browser terminal that swallows hidden password
   prompts.

   So this runs at boot instead. It does nothing at all unless the portal has no
   active administrator, which makes it safe on every subsequent deploy: once
   somebody can sign in, this is a no-op forever.

   The password is generated here rather than configured, so a password never
   has to be typed into a dashboard, committed, or sent through a chat window.
   It is printed once to the log the deploy is already showing, and the account
   is marked as needing a change, so it is useless to anybody who finds it later
   in a log file. */
import { one } from '../src/db.js';
import { pool } from '../src/db.js';
import { generateStrongPassword, hashPassword } from '../src/security.js';

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const name = (process.env.ADMIN_NAME || '').trim();

if (!email || !name) {
  // Nothing configured is a normal state, not an error: an established portal
  // has no need of this.
  process.exit(0);
}

const existing = await one(
  `SELECT count(*)::int count FROM users WHERE role='admin' AND active=true`,
);

if (existing.count > 0) {
  await pool.end();
  process.exit(0);
}

const password = generateStrongPassword(20);
const row = await one(
  `INSERT INTO users(role,name,email,password_hash,must_change_password,active)
   VALUES ('admin',$1,$2,$3,true,true)
   ON CONFLICT (email) DO UPDATE SET role='admin',active=true,updated_at=now()
   RETURNING id,email`,
  [name, email, await hashPassword(password)],
);

/* Deliberately loud. This is the one moment the password exists in readable
   form, and somebody has to be able to find it in a busy deploy log. */
console.log('');
console.log('  ┌────────────────────────────────────────────────────────────┐');
console.log('  │  FIRST ADMINISTRATOR CREATED                               │');
console.log('  └────────────────────────────────────────────────────────────┘');
console.log(`     Email:    ${row.email}`);
console.log(`     Password: ${password}`);
console.log('');
console.log('     Sign in and change it — you will be asked to on arrival.');
console.log('     This appears once. It will not be printed on later deploys.');
console.log('');

await pool.end();
