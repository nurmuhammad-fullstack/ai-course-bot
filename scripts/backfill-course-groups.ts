/**
 * Bitta-kursli sxemadan multi-guruh (courseGroups) sxemasiga o'tish.
 * Ma'lumot yo'qotmasdan: ustunlarni qo'shadi, "Asosiy guruh"ni seed qiladi,
 * mavjud users/schedule/course_lessons/tasks yozuvlarini shu guruhga bog'laydi.
 *
 * Ishlatish: npx tsx scripts/backfill-course-groups.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const COURSE_TOTAL = 1_200_000;
const COURSE_LESSONS = 12;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL .env da yo‘q');
  const sql = postgres(url, { prepare: false });

  console.log('1) Jadval va ustunlarni yaratish...');
  await sql`
    CREATE TABLE IF NOT EXISTS course_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      total_price INTEGER NOT NULL,
      lessons_count INTEGER NOT NULL,
      telegram_chat_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES course_groups(id)`;
  await sql`ALTER TABLE schedule ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES course_groups(id)`;
  await sql`ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES course_groups(id)`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES course_groups(id)`;
  console.log('   OK');

  console.log('2) "Asosiy guruh"ni seed qilish...');
  const existing = await sql`SELECT id FROM course_groups ORDER BY id LIMIT 1`;
  let mainGroupId: number;
  if (existing.length) {
    mainGroupId = existing[0].id;
    console.log(`   Allaqachon mavjud, id=${mainGroupId}`);
  } else {
    const chatIdRow = await sql`SELECT value FROM settings WHERE key = 'group_chat_id'`;
    const telegramChatId = chatIdRow[0]?.value ?? null;
    const [row] = await sql`
      INSERT INTO course_groups (name, total_price, lessons_count, telegram_chat_id)
      VALUES ('Asosiy guruh', ${COURSE_TOTAL}, ${COURSE_LESSONS}, ${telegramChatId})
      RETURNING id
    `;
    mainGroupId = row.id;
    console.log(`   Yaratildi, id=${mainGroupId}, telegram_chat_id=${telegramChatId ?? '(yo‘q)'}`);
  }

  console.log('3) Mavjud yozuvlarni backfill qilish...');
  const u = await sql`UPDATE users SET group_id = ${mainGroupId} WHERE role = 'student' AND group_id IS NULL RETURNING id`;
  console.log(`   users (student): ${u.length} ta yangilandi`);
  const s = await sql`UPDATE schedule SET group_id = ${mainGroupId} WHERE group_id IS NULL RETURNING id`;
  console.log(`   schedule: ${s.length} ta yangilandi`);
  const cl = await sql`UPDATE course_lessons SET group_id = ${mainGroupId} WHERE group_id IS NULL RETURNING id`;
  console.log(`   course_lessons: ${cl.length} ta yangilandi`);
  const t = await sql`UPDATE tasks SET group_id = ${mainGroupId} WHERE group_id IS NULL RETURNING id`;
  console.log(`   tasks: ${t.length} ta yangilandi`);

  console.log('4) NOT NULL constraint (schedule, course_lessons, tasks)...');
  // users.group_id ataylab nullable qoladi (admin/parent uchun)
  await sql`ALTER TABLE schedule ALTER COLUMN group_id SET NOT NULL`;
  await sql`ALTER TABLE course_lessons ALTER COLUMN group_id SET NOT NULL`;
  // tasks.group_id ataylab nullable qoladi (kelajakda umumiy vazifa imkoniyati uchun)

  console.log('5) Eski global unique constraintlarni composite bilan almashtirish...');
  await sql`ALTER TABLE schedule DROP CONSTRAINT IF EXISTS schedule_day_of_week_unique`;
  await sql`ALTER TABLE schedule DROP CONSTRAINT IF EXISTS schedule_day_of_week_key`;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_group_id_day_of_week_unique') THEN
        ALTER TABLE schedule ADD CONSTRAINT schedule_group_id_day_of_week_unique UNIQUE (group_id, day_of_week);
      END IF;
    END $$;
  `;
  await sql`ALTER TABLE course_lessons DROP CONSTRAINT IF EXISTS course_lessons_lesson_date_unique`;
  await sql`ALTER TABLE course_lessons DROP CONSTRAINT IF EXISTS course_lessons_lesson_date_key`;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_lessons_group_id_lesson_date_unique') THEN
        ALTER TABLE course_lessons ADD CONSTRAINT course_lessons_group_id_lesson_date_unique UNIQUE (group_id, lesson_date);
      END IF;
    END $$;
  `;
  console.log('   OK');

  console.log('6) Tekshiruv...');
  const nullSchedule = await sql`SELECT count(*)::int n FROM schedule WHERE group_id IS NULL`;
  const nullLessons = await sql`SELECT count(*)::int n FROM course_lessons WHERE group_id IS NULL`;
  const nullStudents = await sql`SELECT count(*)::int n FROM users WHERE role = 'student' AND group_id IS NULL`;
  console.log(`   schedule.group_id NULL qolgan: ${nullSchedule[0].n}`);
  console.log(`   course_lessons.group_id NULL qolgan: ${nullLessons[0].n}`);
  console.log(`   student.group_id NULL qolgan: ${nullStudents[0].n}`);
  if (nullSchedule[0].n || nullLessons[0].n || nullStudents[0].n) {
    console.warn('   ⚠️ Yuqoridagi sonlar 0 bo‘lishi kerak edi — qo‘lda tekshiring.');
  } else {
    console.log('   ✅ Hammasi to‘g‘ri backfill qilindi.');
  }

  await sql.end();
  console.log('Tayyor! Asosiy guruh id =', mainGroupId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
