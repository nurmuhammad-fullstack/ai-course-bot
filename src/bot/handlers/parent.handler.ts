import { Injectable } from '@nestjs/common';
import { Context } from 'grammy';
import { LessonsRepo } from '../../repos/lessons.repo';
import { PaymentsRepo } from '../../repos/payments.repo';
import { User, UsersRepo } from '../../repos/users.repo';
import { BTN, parentMenu } from '../keyboards';
import { ATT_LABELS, fmtMoney } from '../format';

@Injectable()
export class ParentHandler {
  constructor(
    private readonly users: UsersRepo,
    private readonly payments: PaymentsRepo,
    private readonly lessons: LessonsRepo,
  ) {}

  async handleMessage(ctx: Context, user: User): Promise<void> {
    const text = ctx.message?.text?.trim();

    if (text === '/start') {
      await ctx.reply(`👋 Assalomu alaykum, ${user.name}!`, { reply_markup: parentMenu() });
      return;
    }

    if (text === BTN.PAYMENT_STATUS) {
      const children = await this.users.childrenOfParent(user.id);
      if (!children.length) {
        await ctx.reply("📭 Sizga bog'langan o'quvchi topilmadi. Admin bilan bog'laning.");
        return;
      }
      for (const child of children) {
        const pay = await this.payments.status(child.id);
        await ctx.reply(
          `💳 ${child.name} — to'lov holati:\n\n` +
            `Kurs narxi: ${fmtMoney(pay.total)} (${pay.lessonsCount} ta dars)\n` +
            `O'tilgan (yechilgan) darslar: ${pay.chargedCount} ta — ${fmtMoney(pay.charged)}\n` +
            `Qoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars)`,
        );
      }
      return;
    }

    if (text === BTN.CHILD_ATTENDANCE) {
      const children = await this.users.childrenOfParent(user.id);
      if (!children.length) {
        await ctx.reply("📭 Sizga bog'langan o'quvchi topilmadi. Admin bilan bog'laning.");
        return;
      }
      for (const child of children) {
        const rows = await this.lessons.attendanceForStudent(child.id);
        if (!rows.length) {
          await ctx.reply(`📅 ${child.name}: hali davomat yozuvlari yo'q.`);
          continue;
        }
        let msg = `📅 ${child.name} davomati:\n\n`;
        for (const r of rows) {
          msg += `${r.lessonDate} — ${ATT_LABELS[r.status] ?? r.status}\n`;
        }
        await ctx.reply(msg);
      }
      return;
    }
  }
}
