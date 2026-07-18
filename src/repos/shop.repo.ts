import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { shopItems, shopOrders, users } from '../db/schema';

export type ShopItem = typeof shopItems.$inferSelect;

@Injectable()
export class ShopRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async listActive(): Promise<ShopItem[]> {
    return this.db.select().from(shopItems).where(eq(shopItems.isActive, true)).orderBy(shopItems.price);
  }

  async addItem(name: string, price: number): Promise<ShopItem> {
    const rows = await this.db.insert(shopItems).values({ name, price }).returning();
    return rows[0];
  }

  async itemById(id: number): Promise<ShopItem | undefined> {
    const rows = await this.db.select().from(shopItems).where(eq(shopItems.id, id));
    return rows[0];
  }

  async deactivateItem(id: number) {
    await this.db.update(shopItems).set({ isActive: false }).where(eq(shopItems.id, id));
  }

  async createOrder(itemId: number, studentId: number) {
    const rows = await this.db.insert(shopOrders).values({ itemId, studentId }).returning();
    return rows[0];
  }

  async orderById(id: number) {
    const rows = await this.db
      .select({ order: shopOrders, item: shopItems, student: users })
      .from(shopOrders)
      .innerJoin(shopItems, eq(shopOrders.itemId, shopItems.id))
      .innerJoin(users, eq(shopOrders.studentId, users.id))
      .where(eq(shopOrders.id, id));
    return rows[0];
  }

  async setOrderStatus(id: number, status: 'given' | 'rejected') {
    await this.db.update(shopOrders).set({ status }).where(eq(shopOrders.id, id));
  }

  async pendingOrders() {
    return this.db
      .select({ order: shopOrders, item: shopItems, student: users })
      .from(shopOrders)
      .innerJoin(shopItems, eq(shopOrders.itemId, shopItems.id))
      .innerJoin(users, eq(shopOrders.studentId, users.id))
      .where(eq(shopOrders.status, 'pending'))
      .orderBy(shopOrders.createdAt);
  }
}
