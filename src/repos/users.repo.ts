import { Inject, Injectable } from '@nestjs/common';
import { and, eq, notInArray } from 'drizzle-orm';
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

  async setGroup(id: number, groupId: number) {
    await this.db.update(users).set({ groupId }).where(eq(users.id, id));
  }

  async listByRole(role: string, groupId?: number): Promise<User[]> {
    const where = groupId != null
      ? and(eq(users.role, role), eq(users.groupId, groupId))
      : eq(users.role, role);
    return this.db.select().from(users).where(where).orderBy(users.name);
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
}
