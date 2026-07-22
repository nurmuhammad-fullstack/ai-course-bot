import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { groups } from '../db/schema';

export type Group = typeof groups.$inferSelect;

@Injectable()
export class GroupsRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async upsert(chatId: string, title: string | null) {
    await this.db
      .insert(groups)
      .values({ chatId, title })
      .onConflictDoUpdate({ target: groups.chatId, set: { title } });
  }

  async remove(chatId: string) {
    await this.db.delete(groups).where(eq(groups.chatId, chatId));
  }

  async list(): Promise<Group[]> {
    return this.db.select().from(groups);
  }
}
