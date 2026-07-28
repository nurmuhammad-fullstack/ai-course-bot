import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, InlineKeyboard } from 'grammy';
import { CoinsRepo } from '../../repos/coins.repo';
import { LessonsRepo } from '../../repos/lessons.repo';
import { ShopRepo } from '../../repos/shop.repo';
import { TasksRepo } from '../../repos/tasks.repo';
import { User } from '../../repos/users.repo';
import { StateStore } from '../state';
import { BTN, studentMenu } from '../keyboards';
import { ATT_LABELS, DAY_NAMES } from '../format';
import { AdminHandler } from './admin.handler';

@Injectable()
export class StudentHandler {
  private readonly adminChatId: string;

  constructor(
    private readonly coins: CoinsRepo,
    private readonly tasks: TasksRepo,
    private readonly shop: ShopRepo,
    private readonly lessons: LessonsRepo,
    private readonly admin: AdminHandler,
    private readonly state: StateStore,
    config: ConfigService,
  ) {
    this.adminChatId = config.getOrThrow<string>('ADMIN_CHAT_ID');
  }

  async handleMessage(ctx: Context, user: User): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const text = ctx.message?.text?.trim();
    const st = this.state.get(chatId);

    if (text === '/start') {
      this.state.clear(chatId);
      await ctx.reply(`👋 Assalomu alaykum, ${user.name}!`, { reply_markup: studentMenu() });
      return;
    }

    if (text === BTN.CANCEL) {
      this.state.clear(chatId);
      await ctx.reply('❌ Bekor qilindi.', { reply_markup: studentMenu() });
      return;
    }

    // Vazifa topshirish bosqichi
    if (st?.step === 'submit_task') {
      await this.receiveSubmission(ctx, user, st.taskId as number);
      return;
    }

    switch (text) {
      case BTN.MY_COINS:
        return this.showCoins(ctx, user);
      case BTN.TASKS:
        return this.showTasks(ctx, user);
      case BTN.SHOP.trim():
      case BTN.SHOP:
        return this.showShop(ctx, user);
      case BTN.MY_ATTENDANCE:
        return this.showAttendance(ctx, user);
    }
  }

  private async showCoins(ctx: Context, user: User) {
    const balance = await this.coins.balance(user.id);
    const history = await this.coins.history(user.id, 10);
    let msg = `💰 Balansingiz: ${balance} coin\n`;
    if (history.length) {
      msg += '\nOxirgi harakatlar:\n';
      for (const h of history) {
        msg += `${h.amount > 0 ? '➕' : '➖'} ${Math.abs(h.amount)} — ${h.reason}\n`;
      }
    }
    await ctx.reply(msg);
  }

  private async showTasks(ctx: Context, user: User) {
    const tasks = await this.tasks.listActive(user.groupId!);
    if (!tasks.length) {
      await ctx.reply("📭 Hozircha faol vazifalar yo'q.");
      return;
    }
    const kb = new InlineKeyboard();
    let msg = '🎯 Vazifalar:\n\n';
    for (const t of tasks) {
      let mark = '🆕';
      if (t.type === 'quiz') {
        const res = await this.tasks.quizResult(t.id, user.id);
        if (res) mark = `✅ ${res.score}/${res.total}`;
      } else {
        const sub = await this.tasks.submissionFor(t.id, user.id);
        if (sub?.status === 'approved') mark = '✅';
        else if (sub?.status === 'pending') mark = '⏳';
        else if (sub?.status === 'rejected') mark = '🔄 qayta topshiring';
      }
      const icon = t.type === 'quiz' ? '📝' : '📎';
      msg += `${icon} ${t.title} — ${t.coinReward} coin [${mark}]\n`;
      kb.text(`${icon} ${t.title}`, `task:open:${t.id}`).row();
    }
    await ctx.reply(msg, { reply_markup: kb });
  }

  private async showShop(ctx: Context, user: User) {
    const items = await this.shop.listActive();
    const balance = await this.coins.balance(user.id);
    if (!items.length) {
      await ctx.reply(`🛍 Coinshop hozircha bo'sh.\n💰 Balansingiz: ${balance} coin`);
      return;
    }
    const kb = new InlineKeyboard();
    let msg = `🛍 Coinshop (balansingiz: ${balance} coin):\n\n`;
    for (const item of items) {
      const can = balance >= item.price ? '' : ' 🔒';
      msg += `🎁 ${item.name} — ${item.price} coin${can}\n`;
      kb.text(`🎁 ${item.name} (${item.price})`, `shop:buy:${item.id}`).row();
    }
    await ctx.reply(msg, { reply_markup: kb });
  }

  private async showAttendance(ctx: Context, user: User) {
    const rows = await this.lessons.attendanceForStudent(user.id);
    if (!rows.length) {
      await ctx.reply("📭 Hali davomat yozuvlari yo'q.");
      return;
    }
    let msg = '📅 Davomatingiz:\n\n';
    for (const r of rows) {
      msg += `${r.lessonDate} — ${ATT_LABELS[r.status] ?? r.status}\n`;
    }
    await ctx.reply(msg);
  }

  // ── Callbacklar ─────────────────────────────────────────────────────────────
  async handleCallback(ctx: Context, data: string, user: User): Promise<void> {
    if (data.startsWith('task:open:')) {
      return this.openTask(ctx, user, parseInt(data.split(':')[2], 10));
    }
    if (data.startsWith('quiz:ans:')) {
      return this.answerQuiz(ctx, user, data);
    }
    if (data.startsWith('shop:buy:')) {
      return this.buyItem(ctx, user, parseInt(data.split(':')[2], 10));
    }
  }

  private async openTask(ctx: Context, user: User, taskId: number) {
    const task = await this.tasks.byId(taskId);
    if (!task || !task.isActive) {
      await ctx.answerCallbackQuery({ text: 'Vazifa topilmadi' });
      return;
    }
    const chatId = String(ctx.chat!.id);

    if (task.type === 'assignment') {
      const sub = await this.tasks.submissionFor(taskId, user.id);
      if (sub?.status === 'approved') {
        await ctx.answerCallbackQuery({ text: 'Bu vazifa allaqachon qabul qilingan ✅' });
        return;
      }
      if (sub?.status === 'pending') {
        await ctx.answerCallbackQuery({ text: 'Topshirig‘ingiz tekshirilmoqda ⏳' });
        return;
      }
      this.state.set(chatId, { step: 'submit_task', taskId });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `📎 ${task.title}\n\n${task.description ?? ''}\n\n💰 Mukofot: ${task.coinReward} coin\n\nIshingizni yuboring (matn, rasm yoki fayl). Bekor qilish: «${BTN.CANCEL}»`,
      );
      return;
    }

    // quiz
    const res = await this.tasks.quizResult(taskId, user.id);
    if (res) {
      await ctx.answerCallbackQuery({
        text: `Siz bu testni ishlagansiz: ${res.score}/${res.total} (+${res.coins} coin)`,
        show_alert: true,
      });
      return;
    }
    const questions = await this.tasks.questions(taskId);
    if (!questions.length) {
      await ctx.answerCallbackQuery({ text: "Testda savollar yo'q" });
      return;
    }
    this.state.set(chatId, { step: 'quiz', taskId, qIdx: 0, correct: 0 });
    await ctx.answerCallbackQuery();
    await this.sendQuizQuestion(ctx, taskId, 0, questions.length);
  }

  private async sendQuizQuestion(ctx: Context, taskId: number, qIdx: number, total: number) {
    const questions = await this.tasks.questions(taskId);
    const q = questions[qIdx];
    const options: string[] = JSON.parse(q.options);
    const kb = new InlineKeyboard();
    options.forEach((opt, i) => {
      kb.text(`${String.fromCharCode(65 + i)}) ${opt}`, `quiz:ans:${taskId}:${i}`).row();
    });
    await ctx.reply(`❓ Savol ${qIdx + 1}/${total}:\n\n${q.question}`, { reply_markup: kb });
  }

  private async answerQuiz(ctx: Context, user: User, data: string) {
    const chatId = String(ctx.chat!.id);
    const st = this.state.get(chatId);
    const [, , taskIdStr, optStr] = data.split(':');
    const taskId = parseInt(taskIdStr, 10);

    if (!st || st.step !== 'quiz' || st.taskId !== taskId) {
      await ctx.answerCallbackQuery({ text: 'Bu test sessiyasi eskirgan. Qaytadan oching.' });
      return;
    }

    const questions = await this.tasks.questions(taskId);
    const qIdx = st.qIdx as number;
    const q = questions[qIdx];
    const chosen = parseInt(optStr, 10);
    const isCorrect = chosen === q.correctIndex;
    const correct = (st.correct as number) + (isCorrect ? 1 : 0);

    await ctx.answerCallbackQuery({ text: isCorrect ? "✅ To'g'ri!" : "❌ Noto'g'ri" });
    const options: string[] = JSON.parse(q.options);
    await ctx
      .editMessageText(
        `❓ Savol ${qIdx + 1}/${questions.length}:\n\n${q.question}\n\n` +
          `Sizning javob: ${String.fromCharCode(65 + chosen)}) ${options[chosen]} ${isCorrect ? '✅' : `❌ (to'g'risi: ${String.fromCharCode(65 + q.correctIndex)})`}`,
      )
      .catch(() => undefined);

    if (qIdx + 1 < questions.length) {
      this.state.set(chatId, { ...st, qIdx: qIdx + 1, correct });
      await this.sendQuizQuestion(ctx, taskId, qIdx + 1, questions.length);
      return;
    }

    // Test tugadi
    this.state.clear(chatId);
    const task = (await this.tasks.byId(taskId))!;
    const coins = Math.round((task.coinReward * correct) / questions.length);
    await this.tasks.saveQuizResult(taskId, user.id, correct, questions.length, coins);
    if (coins > 0) {
      await this.coins.add(user.id, coins, `Test: ${task.title} (${correct}/${questions.length})`);
    }
    const balance = await this.coins.balance(user.id);
    await ctx.reply(
      `🏁 Test yakunlandi!\n\n📊 Natija: ${correct}/${questions.length}\n💰 +${coins} coin\n💰 Balans: ${balance} coin`,
    );
    await ctx.api.sendMessage(
      this.adminChatId,
      `📝 ${user.name} «${task.title}» testini ishladi: ${correct}/${questions.length} (+${coins} coin)`,
    ).catch(() => undefined);
  }

  private async receiveSubmission(ctx: Context, user: User, taskId: number) {
    const chatId = String(ctx.chat!.id);
    const msg = ctx.message;
    if (!msg) return;

    let contentType: string;
    let content: string;
    if (msg.photo?.length) {
      contentType = 'photo';
      content = msg.photo[msg.photo.length - 1].file_id;
    } else if (msg.document) {
      contentType = 'document';
      content = msg.document.file_id;
    } else if (msg.text) {
      contentType = 'text';
      content = msg.text;
    } else {
      await ctx.reply('❌ Faqat matn, rasm yoki fayl qabul qilinadi.');
      return;
    }

    const task = await this.tasks.byId(taskId);
    if (!task) {
      this.state.clear(chatId);
      await ctx.reply('❌ Vazifa topilmadi.');
      return;
    }

    const submission = await this.tasks.upsertSubmission({
      taskId,
      studentId: user.id,
      contentType,
      content,
    });
    this.state.clear(chatId);
    await ctx.reply(
      '✅ Topshirig‘ingiz qabul qilindi va tekshirishga yuborildi. Natijani xabar qilamiz!',
      { reply_markup: studentMenu() },
    );

    await this.admin.sendSubmissionForReview(ctx.api, this.adminChatId, {
      submission,
      task,
      student: user,
    });
  }

  private async buyItem(ctx: Context, user: User, itemId: number) {
    const item = await this.shop.itemById(itemId);
    if (!item || !item.isActive) {
      await ctx.answerCallbackQuery({ text: "Sovg'a topilmadi" });
      return;
    }
    const balance = await this.coins.balance(user.id);
    if (balance < item.price) {
      await ctx.answerCallbackQuery({
        text: `Coin yetarli emas: ${balance}/${item.price}`,
        show_alert: true,
      });
      return;
    }
    await this.coins.add(user.id, -item.price, `Buyurtma: ${item.name}`);
    const afterBalance = await this.coins.balance(user.id);
    if (afterBalance < 0) {
      await this.coins.add(user.id, item.price, `Buyurtma bekor (balans yetmadi): ${item.name}`);
      await ctx.answerCallbackQuery({ text: 'Coin yetarli emas', show_alert: true });
      return;
    }
    const order = await this.shop.createOrder(itemId, user.id);
    await ctx.answerCallbackQuery({ text: 'Buyurtma yuborildi! 🎉' });
    await ctx.reply(
      `🛒 «${item.name}» uchun buyurtma berdingiz (-${item.price} coin).\nUstoz tasdiqlagach sovg'ani olasiz. Balans: ${balance - item.price} coin`,
    );
    await ctx.api.sendMessage(
      this.adminChatId,
      `🛒 Yangi buyurtma: ${user.name} — ${item.name} (${item.price} coin)`,
      {
        reply_markup: new InlineKeyboard()
          .text('✅ Berildi', `order:ok:${order.id}`)
          .text('❌ Rad (coin qaytadi)', `order:no:${order.id}`),
      },
    ).catch(() => undefined);
  }
}
