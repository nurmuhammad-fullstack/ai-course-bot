import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike, notInArray, sql } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { parentLinks, users } from '../db/schema';

export type User = typeof users.$inferSelect;

@Injectable()
export class UsersRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async byTelegramId(telegramId: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.telegramId, telegramId));
    return rows[0];
  }

  async byId(id: number): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async upsertPending(telegramId: string, data: { name?: string; phone?: string; username?: string }) {
    const existing = await this.byTelegramId(telegramId);
    if (existing) {
      const rows = await this.db
        .update(users)
        .set(data)
        .where(eq(users.telegramId, telegramId))
        .returning();
      return rows[0];
    }
    const rows = await this.db
      .insert(users)
      .values({ telegramId, role: 'pending', ...data })
      .returning();
    return rows[0];
  }

  async setRole(id: number, role: 'pending' | 'student' | 'parent' | 'admin') {
    await this.db.update(users).set({ role }).where(eq(users.id, id));
  }

  async listByRole(role: string): Promise<User[]> {
    return this.db.select().from(users).where(eq(users.role, role)).orderBy(users.name);
  }

  async remove(id: number) {
    await this.db.delete(users).where(eq(users.id, id));
  }

  async linkParent(parentId: number, studentId: number) {
    await this.db
      .insert(parentLinks)
      .values({ parentId, studentId })
      .onConflictDoNothing();
  }

  /** Hali ota-onasi biriktirilmagan o'quvchilar */
  async studentsWithoutParent(): Promise<User[]> {
    const linked = this.db.select({ id: parentLinks.studentId }).from(parentLinks);
    return this.db
      .select()
      .from(users)
      .where(and(eq(users.role, 'student'), notInArray(users.id, linked)))
      .orderBy(users.name);
  }

  async parentsOfStudent(studentId: number): Promise<User[]> {
    const rows = await this.db
      .select({ user: users })
      .from(parentLinks)
      .innerJoin(users, eq(parentLinks.parentId, users.id))
      .where(eq(parentLinks.studentId, studentId));
    return rows.map((r) => r.user);
  }

  async childrenOfParent(parentId: number): Promise<User[]> {
    const rows = await this.db
      .select({ user: users })
      .from(parentLinks)
      .innerJoin(users, eq(parentLinks.studentId, users.id))
      .where(eq(parentLinks.parentId, parentId));
    return rows.map((r) => r.user);
  }

  /** Gemini AI orqali erkin yozilgan ismdan o'quvchini topish uchun (aniq bo'lmasa ham qidiradi) */
  async findStudentByName(name: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.role, 'student'), ilike(users.name, `%${name}%`)));
    return rows[0];
  }

  /** balansga summani qo'shadi (musbat = to'lov/kredit, manfiy = qarz/oylik yechim) va yangi balansni qaytaradi */
  async adjustBalance(id: number, amount: number): Promise<number> {
    const rows = await this.db
      .update(users)
      .set({ balance: sql`${users.balance} + ${amount}` })
      .where(eq(users.id, id))
      .returning({ balance: users.balance });
    return rows[0].balance;
  }
}
