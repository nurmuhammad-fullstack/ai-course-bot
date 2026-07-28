import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { SCHEDULE_DEFAULTS } from '../config';
import { DRIZZLE, Db } from '../db/db.module';
import { attendance, courseLessons, schedule } from '../db/schema';

export type CourseLesson = typeof courseLessons.$inferSelect;

@Injectable()
export class LessonsRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async seedSchedule(groupId: number) {
    for (const row of SCHEDULE_DEFAULTS) {
      await this.db.insert(schedule).values({ groupId, ...row }).onConflictDoNothing();
    }
  }

  async getSchedule(groupId: number) {
    return this.db
      .select()
      .from(schedule)
      .where(eq(schedule.groupId, groupId))
      .orderBy(asc(schedule.dayOfWeek));
  }

  async scheduleForDay(groupId: number, dayOfWeek: number) {
    const rows = await this.db
      .select()
      .from(schedule)
      .where(and(eq(schedule.groupId, groupId), eq(schedule.dayOfWeek, dayOfWeek)));
    return rows[0];
  }

  async setTime(groupId: number, dayOfWeek: number, lessonTime: string) {
    await this.db
      .update(schedule)
      .set({ lessonTime })
      .where(and(eq(schedule.groupId, groupId), eq(schedule.dayOfWeek, dayOfWeek)));
  }

  async ensureLessonForDate(groupId: number, lessonDate: string): Promise<CourseLesson> {
    const inserted = await this.db
      .insert(courseLessons)
      .values({ groupId, lessonDate })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) return inserted[0];
    const [existing] = await this.db
      .select()
      .from(courseLessons)
      .where(and(eq(courseLessons.groupId, groupId), eq(courseLessons.lessonDate, lessonDate)));
    return existing;
  }

  async lessonById(id: number): Promise<CourseLesson | undefined> {
    const rows = await this.db.select().from(courseLessons).where(eq(courseLessons.id, id));
    return rows[0];
  }

  /** Dars tartib raqami (nechanchi dars) — faqat shu guruh darslari sanaladi */
  async lessonNumber(groupId: number, lesson: CourseLesson): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(courseLessons)
      .where(
        and(
          eq(courseLessons.groupId, groupId),
          sql`${courseLessons.lessonDate} <= ${lesson.lessonDate}`,
        ),
      );
    return row?.n ?? 1;
  }

  async setAttendance(lessonId: number, studentId: number, status: string) {
    await this.db
      .insert(attendance)
      .values({ lessonId, studentId, status })
      .onConflictDoUpdate({
        target: [attendance.lessonId, attendance.studentId],
        set: { status },
      });
  }

  /** Dars bo'yicha barcha davomat (studentId → status) */
  async attendanceForLesson(lessonId: number): Promise<Map<number, string>> {
    const rows = await this.db
      .select({ studentId: attendance.studentId, status: attendance.status })
      .from(attendance)
      .where(eq(attendance.lessonId, lessonId));
    return new Map(rows.map((r) => [r.studentId, r.status]));
  }

  async attendanceForStudent(studentId: number) {
    return this.db
      .select({
        status: attendance.status,
        lessonDate: courseLessons.lessonDate,
      })
      .from(attendance)
      .innerJoin(courseLessons, eq(attendance.lessonId, courseLessons.id))
      .where(eq(attendance.studentId, studentId))
      .orderBy(asc(courseLessons.lessonDate));
  }
}
