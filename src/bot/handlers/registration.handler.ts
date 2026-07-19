import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, InlineKeyboard } from 'grammy';
import { UsersRepo } from '../../repos/users.repo';
import { PaymentsRepo } from '../../repos/payments.repo';
import { StateStore } from '../state';
import { parentMenu, phoneRequestKeyboard, studentMenu } from '../keyboards';

@Injectable()
export class RegistrationHandler {
  private readonly adminChatId: string;

  constructor(
    private readonly users: UsersRepo,
    private readonly payments: PaymentsRepo,
    private readonly state: StateStore,
    config: ConfigService,
  ) {
    this.adminChatId = config.getOrThrow<string>('ADMIN_CHAT_ID');
  }

  /** Ro'yxatda yo'q yoki pending foydalanuvchi xabarlari */
  async handleMessage(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const st = this.state.get(chatId);
    const text = ctx.message?.text?.trim();

    if (text === '/start' || (!st && !ctx.message?.contact)) {
      const user = await this.users.byTelegramId(chatId);
      if (user?.name && user.phone && user.role === 'pending') {
        await ctx.reply(
          "⏳ So'rovingiz yuborilgan. Admin tasdiqlashini kuting — tasdiqlangach xabar beramiz.",
        );
        return;
      }
      this.state.set(chatId, { step: 'reg_name' });
      await ctx.reply(
        "👋 Assalomu alaykum! AI kursi botiga xush kelibsiz.\n\nRo'yxatdan o'tish uchun ism-familiyangizni kiriting:",
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    if (st?.step === 'reg_name' && text) {
      this.state.set(chatId, { step: 'reg_phone', name: text });
      await ctx.reply(
        '📱 Telefon raqamingizni yuboring (tugmani bosing yoki yozib yuboring):',
        { reply_markup: phoneRequestKeyboard() },
      );
      return;
    }

    if (st?.step === 'reg_phone') {
      const phone = ctx.message?.contact?.phone_number ?? text;
      if (!phone || !/^\+?[\d\s-]{7,}$/.test(phone)) {
        await ctx.reply("❌ Raqam noto'g'ri ko'rinadi. Qaytadan yuboring:");
        return;
      }
      const name = st.name as string;
      const user = await this.users.upsertPending(chatId, {
        name,
        phone,
        username: ctx.from?.username ?? undefined,
      });
      this.state.clear(chatId);

      await ctx.reply(
        "✅ So'rovingiz adminга yuborildi. Tasdiqlangach xabar beramiz.",
        { reply_markup: { remove_keyboard: true } },
      );

      const kb = new InlineKeyboard()
        .text("👨‍🎓 O'quvchi", `reg:st:${user.id}`)
        .text('👨‍👩‍👦 Ota-ona', `reg:pa:${user.id}`)
        .row()
        .text('❌ Rad etish', `reg:no:${user.id}`);
      await ctx.api.sendMessage(
        this.adminChatId,
        `📥 Yangi zapros!\n\n👤 Ism: ${name}\n📱 Tel: ${phone}${ctx.from?.username ? `\n🔗 @${ctx.from.username}` : ''}\n\nKim sifatida tasdiqlaysiz?`,
        { reply_markup: kb },
      );
      return;
    }
  }

  /** reg:* callbacklar (admin bosadi) */
  async handleCallback(ctx: Context, data: string): Promise<void> {
    const [, action, idStr, extraStr] = data.split(':');
    const userId = parseInt(idStr, 10);
    const user = await this.users.byId(userId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Foydalanuvchi topilmadi (o‘chirilgan bo‘lishi mumkin)' });
      await ctx.editMessageText('❌ Bu zapros eskirgan.');
      return;
    }

    if (action === 'st') {
      await this.users.setRole(userId, 'student');
      await this.payments.ensure(userId);
      await ctx.editMessageText(`✅ ${user.name} — o'quvchi sifatida tasdiqlandi.`);
      await ctx.api.sendMessage(
        user.telegramId,
        "🎉 Tabriklaymiz! Siz o'quvchi sifatida tasdiqlandingiz.\n\nQuyidagi menyudan foydalaning:",
        { reply_markup: studentMenu() },
      );
      return;
    }

    if (action === 'pa') {
      const students = await this.users.studentsWithoutParent();
      if (!students.length) {
        await ctx.answerCallbackQuery({
          text: "Ota-onasi biriktirilmagan o'quvchi qolmagan!",
          show_alert: true,
        });
        return;
      }
      const kb = new InlineKeyboard();
      for (const s of students) {
        kb.text(s.name ?? s.telegramId, `reg:link:${userId}:${s.id}`).row();
      }
      await ctx.editMessageText(
        `👨‍👩‍👦 ${user.name} kimning ota-onasi? O'quvchini tanlang:`,
        { reply_markup: kb },
      );
      return;
    }

    if (action === 'link') {
      const studentId = parseInt(extraStr, 10);
      const student = await this.users.byId(studentId);
      if (!student) {
        await ctx.answerCallbackQuery({ text: "O'quvchi topilmadi" });
        return;
      }
      await this.users.setRole(userId, 'parent');
      await this.users.linkParent(userId, studentId);
      await ctx.editMessageText(
        `✅ ${user.name} — ${student.name} ning ota-onasi sifatida tasdiqlandi.`,
      );
      await ctx.api.sendMessage(
        user.telegramId,
        `🎉 Siz ${student.name} ning ota-onasi sifatida tasdiqlandingiz.\n\nTo'lov holati va davomatni quyidagi menyudan kuzatasiz:`,
        { reply_markup: parentMenu() },
      );
      return;
    }

    if (action === 'no') {
      await this.users.remove(userId);
      await ctx.editMessageText(`❌ ${user.name} ning so'rovi rad etildi.`);
      await ctx.api.sendMessage(
        user.telegramId,
        "❌ Afsuski, so'rovingiz rad etildi. Savollar bo'lsa admin bilan bog'laning.",
      ).catch(() => undefined);
      return;
    }
  }
}
