/**
 * Eski dars-bot (SQLite) dagi o'quvchilarni yangi Supabase bazasiga ko'chiradi.
 * Ishlatish: npm run migrate:sqlite [eski_bot.db_yo'li]
 */
import 'dotenv/config';
import path from 'path';
import Database from 'better-sqlite3';
import postgres from 'postgres';

const SQLITE_PATH =
  process.argv[2] ?? path.join(__dirname, '..', '..', 'dars-bot', 'data', 'bot.db');
const COURSE_TOTAL = 1_200_000;
const COURSE_LESSONS = 12;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL .env da yo‘q');

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const students = sqlite
    .prepare('SELECT name, telegram_id FROM students')
    .all() as { name: string; telegram_id: string }[];
  console.log(`SQLite'dan ${students.length} ta o'quvchi topildi`);

  const sql = postgres(url, { prepare: false });
  for (const s of students) {
    const rows = await sql`
      INSERT INTO users (telegram_id, name, role)
      VALUES (${s.telegram_id}, ${s.name}, 'student')
      ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name, role = 'student'
      RETURNING id
    `;
    await sql`
      INSERT INTO payments (student_id, total, lessons_count)
      VALUES (${rows[0].id}, ${COURSE_TOTAL}, ${COURSE_LESSONS})
      ON CONFLICT (student_id) DO NOTHING
    `;
    console.log(`✅ ${s.name} ko'chirildi`);
  }
  await sql.end();
  console.log('Tayyor!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
