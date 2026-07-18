import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { coinTransactions } from '../db/schema';

@Injectable()
export class CoinsRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async add(studentId: number, amount: number, reason: string) {
    await this.db.insert(coinTransactions).values({ studentId, amount, reason });
  }

  async balance(studentId: number): Promise<number> {
    const [row] = await this.db
      .select({ balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int` })
      .from(coinTransactions)
      .where(eq(coinTransactions.studentId, studentId));
    return row?.balance ?? 0;
  }

  async history(studentId: number, limit = 10) {
    return this.db
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.studentId, studentId))
      .orderBy(desc(coinTransactions.createdAt))
      .limit(limit);
  }
}
