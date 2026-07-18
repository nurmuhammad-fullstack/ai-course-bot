import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { COURSE } from '../config';
import { DRIZZLE, Db } from '../db/db.module';
import { paymentCharges, payments } from '../db/schema';

export interface PaymentStatus {
  total: number;
  lessonsCount: number;
  charged: number;
  chargedCount: number;
  remaining: number;
  lessonsLeft: number;
}

@Injectable()
export class PaymentsRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async ensure(studentId: number) {
    await this.db
      .insert(payments)
      .values({ studentId, total: COURSE.TOTAL, lessonsCount: COURSE.LESSONS })
      .onConflictDoNothing();
  }

  async status(studentId: number): Promise<PaymentStatus> {
    await this.ensure(studentId);
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
    };
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
