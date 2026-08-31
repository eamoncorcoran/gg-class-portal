import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { one, pool } from '../src/db.js';
import { hashPassword, passwordProblems } from '../src/security.js';

/* Asked for rather than passed in, so the administrator password never lands in
   shell history or in the process list on a shared server. Environment
   variables still work, because the test setup relies on them. */
async function ask() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const name = (await rl.question('Your name: ')).trim();
    const email = (await rl.question('Your email: ')).trim();
    const password = await hidden(rl, 'Choose a password: ');
    const again = await hidden(rl, 'Type it again: ');
    if (password !== again) {
      console.error('The two passwords are different. Nothing was changed.');
      process.exit(1);
    }
    return { name, email, password };
  } finally {
    rl.close();
  }
}

/* readline has no secret mode. Swallow the echo while the answer is typed, so a
   password is not left sitting on screen behind whoever is at the desk. */
function hidden(rl, prompt) {
  const answer = rl.question(prompt);
  const write = stdout.write.bind(stdout);
  stdout.write = (chunk, ...rest) => (String(chunk) === prompt ? write(chunk, ...rest) : true);
  return answer.finally(() => {
    stdout.write = write;
    write('\n');
  });
}

const supplied = {
  name: process.env.ADMIN_NAME || process.argv[2],
  email: process.env.ADMIN_EMAIL || process.argv[3],
  password: process.env.ADMIN_PASSWORD || process.argv[4],
};
const interactive = !supplied.name && !supplied.email && !supplied.password;

if (interactive && !stdin.isTTY) {
  console.error('Usage: ADMIN_NAME="Éamon Corcoran" ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="StrongPassword!" npm run create-admin');
  console.error('Or run it with a terminal attached and it will ask. With Docker, add -it:');
  console.error('  docker compose -f docker-compose.prod.yml exec -it app node scripts/create-admin.js');
  process.exit(1);
}

const input = interactive ? await ask() : supplied;
const parsed = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(1) }).safeParse(input);
if (!parsed.success) {
  console.error('A name, a valid email address and a password are all required.');
  process.exit(1);
}
const problems = passwordProblems(parsed.data.password);
if (problems.length) {
  console.error(problems.join(' '));
  process.exit(1);
}
const hash = await hashPassword(parsed.data.password);
/* Super only when the portal has none. This is the recovery path as well as the
   way to add somebody by hand, and a portal with no super administrator cannot
   be recovered from inside the application at all. Adding a second administrator
   to a healthy portal gives an ordinary one, which is the safer default. */
const noSuperAdmins = (await one(
  `SELECT count(*)::int count FROM users WHERE role='admin' AND active=true AND is_super_admin=true`,
)).count === 0;

const row = await one(
  `INSERT INTO users(role,name,email,password_hash,must_change_password,active,is_super_admin)
   VALUES ('admin',$1,$2,$3,false,true,$4)
   ON CONFLICT (email) DO UPDATE SET role='admin',name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,
     must_change_password=false,active=true,updated_at=now(),
     is_super_admin=users.is_super_admin OR EXCLUDED.is_super_admin
   RETURNING id,name,email`,
  [parsed.data.name, parsed.data.email, hash, noSuperAdmins],
);
console.log(`Administrator ready: ${row.email}`);
await pool.end();
