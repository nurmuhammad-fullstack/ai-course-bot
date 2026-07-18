import { Injectable } from '@nestjs/common';
import { Api, Context, InlineKeyboard } from 'grammy';
import { COURSE } from '../../config';
import { UsersRepo } from '../../repos/users.repo';
import { PaymentsRepo } from '../../repos/payments.repo';
import { CoinsRepo } from '../../repos/coins.repo';
import { LessonsRepo } from '../../repos/lessons.repo';
import { TasksRepo } from '../../repos/tasks.repo';
import { ShopRepo } from '../../repos/shop.repo';
import { StateStore } from '../state';
import { BTN, adminMenu, cancelKeyboard, doneCancelKeyboard } from '../keyboards';
import { ATT_LABELS, DAY_NAMES, fmtMoney, parseTime, todayDate } from '../format';

@Injectable()
export class AdminHandler {
  constructor(
    private readonly users: UsersRepo,
    private readonly payments: PaymentsRepo,
    private readonly coins: CoinsRepo,
    private readonly lessons: LessonsRepo,
    private readonly tasks: TasksRepo,
    private readonly shop: ShopRepo,
    private readonly state: StateStore,
  ) {}

  // ── Xabarlar ────────────────────────────────────────────────────────────────
  async handleMessage(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const text = ctx.message?.text?.trim();
    const st = this.state.get(chatId);

    if (text === '/start') {
      this.state.clear(chatId);
      await ctx.reply('👋 Assalomu alaykum, Ustoz! Boshqaruv menyusi:', {
        reply_markup: adminMenu(),
      });
      return;
    }

    if (text === BTN.CANCEL) {
      this.state.clear(chatId);
      await ctx.reply('❌ Bekor qilindi.', { reply_markup: adminMenu() });
      return;
    }

    // ── Forma bosqichlari ──
    if (st) {
      await this.handleStateStep(ctx, chatId, st, text);
      return;
    }

    switch (text) {
      case BTN.REQUESTS:
        return this.showRequests(ctx);
      case BTN.STUDENTS:
        return this.showStudents(ctx);
      case BTN.SCHEDULE:
        return this.showSchedule(ctx);
      case BTN.FINISH_LESSON:
        await ctx.reply('Bugungi darsni yakunlab, davomat va to‘lovni belgilaymizmi?', {
          reply_markup: new InlineKeyboard().text('✅ Ha, yakunlash', 'lessonend:start'),
        });
        return;
      case BTN.ADD_TASK:
        await ctx.reply('Qanday vazifa qo‘shamiz?', {
          reply_markup: new InlineKeyboard()
            .text('📝 Test (avtomatik)', 'taskadm:quiz')
            .text('📎 Vazifa (topshiriladigan)', 'taskadm:assign'),
        });
        return;
      case BTN.SUBMISSIONS:
        return this.showSubmissions(ctx);
      case BTN.SHOP_ADMIN:
        return this.showShopAdmin(ctx);
      case BTN.REPORT:
        return this.showReport(ctx);
    }
  }

  private async handleStateStep(ctx: Context, chatId: string, st: any, text?: string) {
    // Dars vaqtini o'zgartirish
    if (st.step === 'sched_time' && text) {
      const t = parseTime(text);
      if (!t) {
        await ctx.reply("❌ Format noto'g'ri. Masalan: 18:30");
        return;
      }
      await this.lessons.setTime(st.dow, text);
      this.state.clear(chatId);
      await ctx.reply(`✅ ${DAY_NAMES[st.dow]} darsi ${text} ga o'rnatildi.`, {
        reply_markup: adminMenu(),
      });
      return;
    }

    // Vazifa yaratish
    if (st.step === 'task_title' && text) {
      this.state.set(chatId, { ...st, step: 'task_reward', title: text });
      await ctx.reply('💰 Bu vazifa uchun nechta coin beriladi? (raqam kiriting)');
      return;
    }

    if (st.step === 'task_reward' && text) {
      const reward = parseInt(text, 10);
      if (!reward || reward <= 0) {
        await ctx.reply('❌ Musbat raqam kiriting:');
        return;
      }
      if (st.type === 'assignment') {
        this.state.set(chatId, { ...st, step: 'task_desc', reward });
        await ctx.reply('📄 Vazifa shartini (tavsifini) yozing:');
      } else {
        const task = await this.tasks.create({
          type: 'quiz',
          title: st.title,
          coinReward: reward,
          isActive: false,
        });
        this.state.set(chatId, { step: 'quiz_q', taskId: task.id, count: 0 });
        await ctx.reply(
          '❓ Endi savollarni yuboring. Har bir savol shu formatda, bitta xabarda:\n\n' +
            'Savol matni\nA) birinchi variant\nB) ikkinchi variant\nC) uchinchi variant\nD) to‘rtinchi variant\nJavob: B\n\n' +
            'Kamida 2 ta variant bo‘lsin. Tugatgach «✅ Yakunlash» ni bosing.',
          { reply_markup: doneCancelKeyboard() },
        );
      }
      return;
    }

    if (st.step === 'task_desc' && text) {
      const task = await this.tasks.create({
        type: 'assignment',
        title: st.title,
        description: text,
        coinReward: st.reward,
      });
      this.state.clear(chatId);
      await ctx.reply(`✅ Vazifa qo'shildi: ${task.title} (+${task.coinReward} coin)`, {
        reply_markup: adminMenu(),
      });
      await this.broadcastToStudents(
        ctx.api,
        `🎯 Yangi vazifa: ${task.title}\n\n${text}\n\n💰 Mukofot: ${task.coinReward} coin\n\n«${BTN.TASKS}» bo'limidan topshiring!`,
      );
      return;
    }

    if (st.step === 'quiz_q' && text) {
      if (text === BTN.DONE) {
        if (!st.count) {
          await ctx.reply('❌ Hali birorta savol qo‘shilmadi. Avval savol yuboring.');
          return;
        }
        await this.tasks.activate(st.taskId);
        const task = await this.tasks.byId(st.taskId);
        this.state.clear(chatId);
        await ctx.reply(`✅ Test tayyor: ${task!.title} (${st.count} ta savol).`, {
          reply_markup: adminMenu(),
        });
        await this.broadcastToStudents(
          ctx.api,
          `🎯 Yangi test: ${task!.title} (${st.count} ta savol)\n💰 Mukofot: ${task!.coinReward} coin gacha\n\n«${BTN.TASKS}» bo'limidan ishlang!`,
        );
        return;
      }
      const parsed = this.parseQuizQuestion(text);
      if (!parsed) {
        await ctx.reply(
          '❌ Formatni tushunmadim. Namuna:\n\nAI nima?\nA) Sun’iy intellekt\nB) Operatsion tizim\nJavob: A',
        );
        return;
      }
      await this.tasks.addQuestion(st.taskId, parsed.question, parsed.options, parsed.correctIndex);
      this.state.set(chatId, { ...st, count: st.count + 1 });
      await ctx.reply(`✅ ${st.count + 1}-savol qo'shildi. Yana yuboring yoki «${BTN.DONE}».`);
      return;
    }

    // Coinshop: yangi sovg'a
    if (st.step === 'shop_item_name' && text) {
      this.state.set(chatId, { step: 'shop_item_price', name: text });
      await ctx.reply('💰 Bu sovg‘a nechta coin turadi?');
      return;
    }
    if (st.step === 'shop_item_price' && text) {
      const price = parseInt(text, 10);
      if (!price || price <= 0) {
        await ctx.reply('❌ Musbat raqam kiriting:');
        return;
      }
      const item = await this.shop.addItem(st.name, price);
      this.state.clear(chatId);
      await ctx.reply(`✅ Coinshopga qo'shildi: ${item.name} — ${item.price} coin`, {
        reply_markup: adminMenu(),
      });
      await this.broadcastToStudents(
        ctx.api,
        `🛍 Coinshopda yangi sovg'a: ${item.name} — ${item.price} coin!`,
      );
      return;
    }
  }

  private parseQuizQuestion(
    text: string,
  ): { question: string; options: string[]; correctIndex: number } | null {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const options: string[] = [];
    const questionLines: string[] = [];
    let answerLetter: string | null = null;

    for (const line of lines) {
      const ans = line.match(/^javob\s*:?\s*([a-d])\)?$/i);
      if (ans) {
        answerLetter = ans[1].toUpperCase();
        continue;
      }
      const opt = line.match(/^([a-d])[)\.\-]\s*(.+)$/i);
      if (opt) {
        options.push(opt[2].trim());
        continue;
      }
      questionLines.push(line);
    }

    if (!questionLines.length || options.length < 2 || !answerLetter) return null;
    const correctIndex = answerLetter.charCodeAt(0) - 65;
    if (correctIndex >= options.length) return null;
    return { question: questionLines.join('\n'), options, correctIndex };
  }

  // ── Bo'limlar ───────────────────────────────────────────────────────────────
  private async showRequests(ctx: Context) {
    const pending = (await this.users.listByRole('pending')).filter((u) => u.name && u.phone);
    if (!pending.length) {
      await ctx.reply("📭 Yangi zaproslar yo'q.");
      return;
    }
    for (const u of pending) {
      const kb = new InlineKeyboard()
        .text("👨‍🎓 O'quvchi", `reg:st:${u.id}`)
        .text('👨‍👩‍👦 Ota-ona', `reg:pa:${u.id}`)
        .row()
        .text('❌ Rad etish', `reg:no:${u.id}`);
      await ctx.reply(
        `📥 ${u.name}\n📱 ${u.phone}${u.username ? `\n🔗 @${u.username}` : ''}`,
        { reply_markup: kb },
      );
    }
  }

  private async showStudents(ctx: Context) {
    const students = await this.users.listByRole('student');
    if (!students.length) {
      await ctx.reply("📭 Hali o'quvchilar yo'q.");
      return;
    }
    let msg = "👨‍🎓 O'quvchilar:\n";
    for (const [i, s] of students.entries()) {
      const balance = await this.coins.balance(s.id);
      const pay = await this.payments.status(s.id);
      msg += `\n${i + 1}. ${s.name} — 💰 ${balance} coin | 💳 qoldiq ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars)`;
    }
    await ctx.reply(msg);
  }

  private async showSchedule(ctx: Context) {
    const rows = await this.lessons.getSchedule();
    const kb = new InlineKeyboard();
    let msg = '🕐 Dars jadvali (Toshkent vaqti):\n\n';
    for (const r of rows) {
      msg += `${DAY_NAMES[r.dayOfWeek]} — ${r.lessonTime}\n`;
      kb.text(`✏️ ${DAY_NAMES[r.dayOfWeek]}`, `sched:${r.dayOfWeek}`).row();
    }
    msg += "\nVaqtni o'zgartirish uchun kunni tanlang:";
    await ctx.reply(msg, { reply_markup: kb });
  }

  private async showSubmissions(ctx: Context) {
    const rows = await this.tasks.pendingSubmissions();
    if (!rows.length) {
      await ctx.reply("📭 Tekshirilmagan topshiriqlar yo'q.");
      return;
    }
    for (const { submission, task, student } of rows) {
      await this.sendSubmissionForReview(ctx.api, String(ctx.chat!.id), {
        submission,
        task,
        student,
      });
    }
  }

  async sendSubmissionForReview(
    api: Api,
    adminChatId: string,
    row: { submission: any; task: any; student: any },
  ) {
    const { submission, task, student } = row;
    const caption = `📤 ${student.name} — «${task.title}» (+${task.coinReward} coin)`;
    const kb = new InlineKeyboard()
      .text('✅ Qabul (+coin)', `sub:ok:${submission.id}`)
      .text('❌ Rad etish', `sub:no:${submission.id}`);

    if (submission.contentType === 'photo') {
      await api.sendPhoto(adminChatId, submission.content, { caption, reply_markup: kb });
    } else if (submission.contentType === 'document') {
      await api.sendDocument(adminChatId, submission.content, { caption, reply_markup: kb });
    } else {
      await api.sendMessage(adminChatId, `${caption}\n\n💬 Javob:\n${submission.content}`, {
        reply_markup: kb,
      });
    }
  }

  private async showShopAdmin(ctx: Context) {
    const items = await this.shop.listActive();
    const kb = new InlineKeyboard();
    let msg = '🛍 Coinshop sovg‘alari:\n\n';
    if (!items.length) msg += "(hozircha bo'sh)\n";
    for (const item of items) {
      msg += `• ${item.name} — ${item.price} coin\n`;
      kb.text(`🗑 ${item.name}`, `shopadm:del:${item.id}`).row();
    }
    kb.text("➕ Sovg'a qo'shish", 'shopadm:add');
    await ctx.reply(msg, { reply_markup: kb });

    const orders = await this.shop.pendingOrders();
    for (const { order, item, student } of orders) {
      await ctx.reply(
        `🛒 Buyurtma: ${student.name} — ${item.name} (${item.price} coin)`,
        {
          reply_markup: new InlineKeyboard()
            .text('✅ Berildi', `order:ok:${order.id}`)
            .text('❌ Rad (coin qaytadi)', `order:no:${order.id}`),
        },
      );
    }
  }

  private async showReport(ctx: Context) {
    const students = await this.users.listByRole('student');
    if (!students.length) {
      await ctx.reply("📭 Hali o'quvchilar yo'q.");
      return;
    }
    let msg = '📊 Hisobot:\n';
    for (const s of students) {
      const balance = await this.coins.balance(s.id);
      const pay = await this.payments.status(s.id);
      const att = await this.lessons.attendanceForStudent(s.id);
      const came = att.filter((a) => a.status === 'came').length;
      const missed = att.filter((a) => a.status !== 'came').length;
      msg +=
        `\n👤 ${s.name}\n` +
        `   💰 ${balance} coin | ✅ ${came} dars, ❌ ${missed} qoldirgan\n` +
        `   💳 To'langan darslar: ${pay.chargedCount}/${pay.lessonsCount}, qoldiq: ${fmtMoney(pay.remaining)}\n`;
    }
    await ctx.reply(msg);
  }

  // ── Callbacklar ─────────────────────────────────────────────────────────────
  async handleCallback(ctx: Context, data: string): Promise<void> {
    const chatId = String(ctx.chat!.id);

    if (data === 'lessonend:start') {
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await this.finalizeLesson(ctx);
      return;
    }

    if (data.startsWith('sched:')) {
      const dow = parseInt(data.split(':')[1], 10);
      this.state.set(chatId, { step: 'sched_time', dow });
      await ctx.answerCallbackQuery();
      await ctx.reply(`${DAY_NAMES[dow]} uchun yangi vaqtni kiriting (masalan 18:30):`, {
        reply_markup: cancelKeyboard(),
      });
      return;
    }

    if (data === 'taskadm:quiz' || data === 'taskadm:assign') {
      const type = data.endsWith('quiz') ? 'quiz' : 'assignment';
      this.state.set(chatId, { step: 'task_title', type });
      await ctx.answerCallbackQuery();
      await ctx.reply('📝 Vazifa nomini kiriting:', { reply_markup: cancelKeyboard() });
      return;
    }

    if (data.startsWith('att:')) {
      return this.handleAttendance(ctx, data);
    }

    if (data.startsWith('sub:')) {
      return this.handleSubmissionReview(ctx, data);
    }

    if (data === 'shopadm:add') {
      this.state.set(chatId, { step: 'shop_item_name' });
      await ctx.answerCallbackQuery();
      await ctx.reply("🎁 Sovg'a nomini kiriting:", { reply_markup: cancelKeyboard() });
      return;
    }

    if (data.startsWith('shopadm:del:')) {
      const itemId = parseInt(data.split(':')[2], 10);
      await this.shop.deactivateItem(itemId);
      await ctx.answerCallbackQuery({ text: "O'chirildi" });
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }

    if (data.startsWith('order:')) {
      return this.handleOrder(ctx, data);
    }
  }

  /** Bugungi darsni yakunlash: davomat + to'lov */
  async finalizeLesson(ctx: { api: Api; reply?: any } & Context) {
    const dateStr = todayDate();
    const lesson = await this.lessons.ensureLessonForDate(dateStr);
    const n = await this.lessons.lessonNumber(lesson);
    const students = await this.users.listByRole('student');
    if (!students.length) {
      await ctx.reply("📭 O'quvchilar yo'q.");
      return;
    }
    await ctx.reply(
      `📚 ${dateStr} — ${n}-dars.\nHar bir o'quvchi uchun davomatni belgilang (to'lov shunga qarab yechiladi):`,
    );
    for (const s of students) {
      const kb = new InlineKeyboard()
        .text('✅ Keldi', `att:came:${lesson.id}:${s.id}`)
        .row()
        .text('❌ Kelmadi (sababsiz)', `att:unexc:${lesson.id}:${s.id}`)
        .row()
        .text('⚠️ Kelmadi (ogohlantirgan)', `att:exc:${lesson.id}:${s.id}`);
      await ctx.api.sendMessage(String(ctx.chat!.id), `👤 ${s.name}`, { reply_markup: kb });
    }
  }

  private async handleAttendance(ctx: Context, data: string) {
    const [, code, lessonIdStr, studentIdStr] = data.split(':');
    const lessonId = parseInt(lessonIdStr, 10);
    const studentId = parseInt(studentIdStr, 10);
    const status =
      code === 'came' ? 'came' : code === 'unexc' ? 'missed_unexcused' : 'missed_excused';

    const student = await this.users.byId(studentId);
    const lesson = await this.lessons.lessonById(lessonId);
    if (!student || !lesson) {
      await ctx.answerCallbackQuery({ text: 'Topilmadi' });
      return;
    }

    await this.lessons.setAttendance(lessonId, studentId, status);
    const n = await this.lessons.lessonNumber(lesson);

    let paymentNote = '';
    if (status === 'came' || status === 'missed_unexcused') {
      const newCharge = await this.payments.charge(lessonId, studentId, COURSE.LESSON_PRICE);
      const pay = await this.payments.status(studentId);
      paymentNote = `💳 ${fmtMoney(COURSE.LESSON_PRICE)} yechildi. Qoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars)`;
      if (newCharge) {
        const reason =
          status === 'came'
            ? `${n}-dars bo'lib o'tdi`
            : `${n}-dars (kelmadi, oldindan ogohlantirilmagan)`;
        await this.notifyParents(
          ctx.api,
          studentId,
          `💳 ${student.name}: ${reason}.\n${fmtMoney(COURSE.LESSON_PRICE)} hisobdan yechildi.\n\nQoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars qoldi)`,
        );
      }
    } else {
      const removed = await this.payments.uncharge(lessonId, studentId);
      const pay = await this.payments.status(studentId);
      paymentNote = `💳 To'lov yechilmadi. Qoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars)`;
      await this.notifyParents(
        ctx.api,
        studentId,
        `⚠️ ${student.name}: ${n}-darsga kela olmasligini oldindan ogohlantirgan.\nBu dars uchun to'lov yechilmadi.${removed ? " (Avvalgi yechilgan summa qaytarildi.)" : ''}\n\nQoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars qoldi)`,
      );
    }

    await ctx.answerCallbackQuery({ text: ATT_LABELS[status] });
    await ctx
      .editMessageText(`👤 ${student.name} — ${ATT_LABELS[status]}\n${paymentNote}`, {
        reply_markup: new InlineKeyboard()
          .text('✅', `att:came:${lessonId}:${studentId}`)
          .text('❌', `att:unexc:${lessonId}:${studentId}`)
          .text('⚠️', `att:exc:${lessonId}:${studentId}`),
      })
      .catch(() => undefined);
  }

  private async handleSubmissionReview(ctx: Context, data: string) {
    const [, action, idStr] = data.split(':');
    const row = await this.tasks.submissionById(parseInt(idStr, 10));
    if (!row) {
      await ctx.answerCallbackQuery({ text: 'Topilmadi' });
      return;
    }
    const { submission, task, student } = row;
    if (submission.status !== 'pending') {
      await ctx.answerCallbackQuery({ text: 'Allaqachon ko‘rilgan' });
      return;
    }

    if (action === 'ok') {
      await this.tasks.setSubmissionStatus(submission.id, 'approved');
      await this.coins.add(student.id, task.coinReward, `Vazifa: ${task.title}`);
      const balance = await this.coins.balance(student.id);
      await ctx.answerCallbackQuery({ text: 'Qabul qilindi' });
      await ctx.api.sendMessage(
        student.telegramId,
        `🎉 «${task.title}» vazifangiz qabul qilindi!\n💰 +${task.coinReward} coin. Balans: ${balance} coin`,
      ).catch(() => undefined);
    } else {
      await this.tasks.setSubmissionStatus(submission.id, 'rejected');
      await ctx.answerCallbackQuery({ text: 'Rad etildi' });
      await ctx.api.sendMessage(
        student.telegramId,
        `❌ «${task.title}» vazifangiz rad etildi. Qayta ishlab, yana topshirishingiz mumkin.`,
      ).catch(() => undefined);
    }
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  }

  private async handleOrder(ctx: Context, data: string) {
    const [, action, idStr] = data.split(':');
    const row = await this.shop.orderById(parseInt(idStr, 10));
    if (!row) {
      await ctx.answerCallbackQuery({ text: 'Topilmadi' });
      return;
    }
    const { order, item, student } = row;
    if (order.status !== 'pending') {
      await ctx.answerCallbackQuery({ text: 'Allaqachon ko‘rilgan' });
      return;
    }

    if (action === 'ok') {
      await this.shop.setOrderStatus(order.id, 'given');
      await ctx.answerCallbackQuery({ text: 'Berildi ✅' });
      await ctx.api.sendMessage(
        student.telegramId,
        `🎁 «${item.name}» sovg'angiz tayyor! Ustozdan olib keting.`,
      ).catch(() => undefined);
    } else {
      await this.shop.setOrderStatus(order.id, 'rejected');
      await this.coins.add(student.id, item.price, `Buyurtma bekor: ${item.name} (coin qaytdi)`);
      const balance = await this.coins.balance(student.id);
      await ctx.answerCallbackQuery({ text: 'Rad etildi, coin qaytdi' });
      await ctx.api.sendMessage(
        student.telegramId,
        `❌ «${item.name}» buyurtmangiz bekor qilindi. ${item.price} coin qaytarildi. Balans: ${balance} coin`,
      ).catch(() => undefined);
    }
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  }

  // ── Yordamchilar ────────────────────────────────────────────────────────────
  async broadcastToStudents(api: Api, text: string) {
    const students = await this.users.listByRole('student');
    for (const s of students) {
      await api.sendMessage(s.telegramId, text).catch(() => undefined);
    }
  }

  async notifyParents(api: Api, studentId: number, text: string) {
    const parents = await this.users.parentsOfStudent(studentId);
    for (const p of parents) {
      await api.sendMessage(p.telegramId, text).catch(() => undefined);
    }
  }
}
