import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { courseGroups } from '../db/schema';

export type CourseGroup = typeof courseGroups.$inferSelect;

@Injectable()
export class CourseGroupsRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async list(): Promise<CourseGroup[]> {
    return this.db
      .select()
      .from(courseGroups)
      .where(eq(courseGroups.isActive, true))
      .orderBy(courseGroups.id);
  }

  async byId(id: number): Promise<CourseGroup | undefined> {
    const rows = await this.db.select().from(courseGroups).where(eq(courseGroups.id, id));
    return rows[0];
  }

  async create(data: {
    name: string;
    totalPrice: number;
    lessonsCount: number;
    telegramChatId?: string | null;
  }): Promise<CourseGroup> {
    const rows = await this.db.insert(courseGroups).values(data).returning();
    return rows[0];
  }

  async update(
    id: number,
    patch: Partial<{ name: string; totalPrice: number; lessonsCount: number; telegramChatId: string | null }>,
  ): Promise<CourseGroup | undefined> {
    const rows = await this.db
      .update(courseGroups)
      .set(patch)
      .where(eq(courseGroups.id, id))
      .returning();
    return rows[0];
  }

  async deactivate(id: number) {
    await this.db.update(courseGroups).set({ isActive: false }).where(eq(courseGroups.id, id));
  }
}
