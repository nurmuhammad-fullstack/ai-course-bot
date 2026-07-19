import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { settings } from '../db/schema';

@Injectable()
export class SettingsRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async get(key: string): Promise<string | null> {
    const rows = await this.db.select().from(settings).where(eq(settings.key, key));
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string) {
    await this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}
