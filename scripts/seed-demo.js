import { one, query, pool } from '../src/db.js';
import { ensureWeeksForClass } from '../src/weeks.js';

const classes = [
  { programme: 'Irish for Primary Teaching', day: 1, time: '19:00', timezone: 'Europe/Dublin' },
  { programme: 'Irish for Primary Teaching', day: 4, time: '19:00', timezone: 'Europe/Dublin' },
];
for (const item of classes) {
  let row = await one(
    `SELECT * FROM classes WHERE programme_name=$1 AND day_of_week=$2 AND start_time=$3`,
    [item.programme, item.day, item.time],
  );
  if (!row) {
    row = await one(
      `INSERT INTO classes(programme_name,day_of_week,start_time,timezone)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [item.programme, item.day, item.time, item.timezone],
    );
  }
  await ensureWeeksForClass(row);
}
console.log('Demo classes ready.');
await pool.end();
