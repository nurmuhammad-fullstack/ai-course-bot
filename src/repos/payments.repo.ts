import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { paymentCharges, payments } from '../db/schema';
import { CourseGroupsRepo } from './course-groups.repo';

export interface PaymentStatus {
  total: number;
  lessonsCount: number;
  charged: number;
  chargedCount: number;
  remaining: number;
  lessonsLeft: number;
  dueDay: number | null;
}

@Injectable()
export class PaymentsRepo {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly courseGroups: CourseGroupsRepo,
  ) {}

  /** Talaba profilini yaratadi — narx guruhning joriy narxidan nusxalanadi (bir marta, keyin o'zgarmaydi) */
  async ensure(studentId: number, groupId: number) {
    const existing = await this.db.select().from(payments).where(eq(payments.studentId, studentId));
    if (existing.length) return;
    const group = await this.courseGroups.byId(groupId);
    if (!group) throw new Error(`Guruh topilmadi: ${groupId}`);
    await this.db
      .insert(payments)
      .values({ studentId, total: group.totalPrice, lessonsCount: group.lessonsCount })
      .onConflictDoNothing();
  }

  async status(studentId: number): Promise<PaymentStatus> {
    const [pay] = await this.db.select().from(payments).where(eq(payments.studentId, studentId));
    const [agg] = await this.db
      .select({
        charged: sql<number>`coalesce(sum(${paymentCharges.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(paymentCharges)
      .where(eq(paymentCharges.studentId, studentId));
    const charged = agg?.charged ?? 0;
    const chargedCount = agg?.count ?? 0;
    return {
      total: pay.total,
      lessonsCount: pay.lessonsCount,
      charged,
      chargedCount,
      remaining: pay.total - charged,
      lessonsLeft: pay.lessonsCount - chargedCount,
      dueDay: pay.dueDay ?? null,
    };
  }

  async setDueDay(studentId: number, dueDay: number | null) {
    await this.db.update(payments).set({ dueDay }).where(eq(payments.studentId, studentId));
  }

  /** To'lov kuni belgilangan barcha yozuvlar */
  async withDueDays() {
    return this.db
      .select()
      .from(payments)
      .where(sql`${payments.dueDay} is not null`);
  }

  /** true qaytarsa — yangi yechildi; false — bu dars uchun oldin yechilgan */
  async charge(lessonId: number, studentId: number, amount: number): Promise<boolean> {
    const rows = await this.db
      .insert(paymentCharges)
      .values({ lessonId, studentId, amount })
      .onConflictDoNothing()
      .returning();
    return rows.length > 0;
  }

  async uncharge(lessonId: number, studentId: number): Promise<boolean> {
    const rows = await this.db
      .delete(paymentCharges)
      .where(
        sql`${paymentCharges.lessonId} = ${lessonId} and ${paymentCharges.studentId} = ${studentId}`,
      )
      .returning();
    return rows.length > 0;
  }
}
