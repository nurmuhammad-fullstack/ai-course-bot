import { Injectable } from '@nestjs/common';
import { Api, Context, InlineKeyboard } from 'grammy';
import { UsersRepo } from '../../repos/users.repo';
import { PaymentsRepo } from '../../repos/payments.repo';
import { CoinsRepo } from '../../repos/coins.repo';
import { LessonsRepo } from '../../repos/lessons.repo';
import { TasksRepo } from '../../repos/tasks.repo';
import { ShopRepo } from '../../repos/shop.repo';
import { CourseGroupsRepo } from '../../repos/course-groups.repo';
import { StateStore } from '../state';
import { BTN, adminMenu, cancelKeyboard, doneCancelKeyboard } from '../keyboards';
import {
  ATT_LABELS,
  DAY_NAMES,
  fmtMoney,
  parseTime,
  todayDate,
  todayDayOfWeek,
} from '../format';
import { AttStatus, LessonFlowService } from '../../services/lesson-flow.service';
import { SettingsRepo } from '../../repos/settings.repo';

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
    private readonly lessonFlow: LessonFlowService,
    private readonly settings: SettingsRepo,
    private readonly courseGroups: CourseGroupsRepo,
  ) {}

  /** Admin uchun joriy faol guruh — settings jadvalida saqlanadi, bot restart bo'lsa ham saqlanadi */
  async getActiveGroupId(adminChatId: string): Promise<number> {
    const raw = await this.settings.get(`active_group:${adminChatId}`);
    const groups = await this.courseGroups.list();
    if (!groups.length) throw new Error("Hali birorta guruh yo'q. Mini app orqali guruh yarating.");
    if (raw) {
      const id = parseInt(raw, 10);
      if (groups.some((g) => g.id === id)) return id;
    }
    return groups[0].id;
  }

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

    let groupId: number;
    try {
      groupId = await this.getActiveGroupId(chatId);
    } catch (e) {
      if (text === BTN.SWITCH_GROUP) {
        await ctx.reply((e as Error).message);
        return;
      }
      groupId = 0; // shop/hisobot kabi guruhsiz ishlaydigan bo'limlar uchun pastda qayta hisoblanadi
    }

    switch (text) {
      case BTN.REQUESTS:
        return this.showRequests(ctx);
      case BTN.STUDENTS:
        return this.showStudents(ctx, groupId);
      case BTN.SCHEDULE:
        return this.showSchedule(ctx, groupId);
      case BTN.FINISH_LESSON: {
        if (!(await this.lessons.scheduleForDay(groupId, todayDayOfWeek()))) {
          await ctx.reply("❌ Bugun dars kuni emas — darsni yakunlab bo'lmaydi.\n\nDars kunlari: «🕐 Dars jadvali» bo'limida.");
          return;
        }
        await ctx.reply('Bugungi darsni yakunlab, davomat va to‘lovni belgilaymizmi?', {
          reply_markup: new InlineKeyboard().text('✅ Ha, yakunlash', `lessonend:start:${groupId}`),
        });
        return;
      }
      case BTN.ADD_TASK:
        await ctx.reply('Qanday vazifa qo‘shamiz?', {
          reply_markup: new InlineKeyboard()
            .text('📝 Test (avtomatik)', 'taskadm:quiz')
            .text('📎 Vazifa (topshiriladigan)', 'taskadm:assign'),
        });
        return;
      case BTN.SUBMISSIONS:
        return this.showSubmissions(ctx, groupId);
      case BTN.SHOP_ADMIN:
        return this.showShopAdmin(ctx);
      case BTN.REPORT:
        return this.showReport(ctx, groupId);
      case BTN.PAYMENTS:
        return this.showPayments(ctx, groupId);
      case BTN.SWITCH_GROUP:
        return this.showGroupSwitcher(ctx);
    }
  }

  private async showGroupSwitcher(ctx: Context) {
    const groups = await this.courseGroups.list();
    if (!groups.length) {
      await ctx.reply("📭 Hali birorta guruh yo'q. Mini app orqali yangi guruh yarating.");
      return;
    }
    const chatId = String(ctx.chat!.id);
    const activeId = await this.getActiveGroupId(chatId);
    const kb = new InlineKeyboard();
    for (const g of groups) {
      const mark = g.id === activeId ? '✅ ' : '';
      kb.text(`${mark}${g.name}`, `group:switch:${g.id}`).row();
    }
    await ctx.reply('🔀 Qaysi guruh bilan ishlaysiz?\n\n(Yangi guruh yaratish — mini app orqali)', {
      reply_markup: kb,
    });
  }

  private async showPayments(ctx: Context, groupId: number) {
    const students = await this.users.listByRole('student', groupId);
    if (!students.length) {
      await ctx.reply("📭 Hali o'quvchilar yo'q.");
      return;
    }
    const kb = new InlineKeyboard();
    let msg = "💳 To'lovlar:\n";
    for (const s of students) {
      const pay = await this.payments.status(s.id);
      const due = pay.dueDay ? `📅 har oyning ${pay.dueDay}-kuni` : '📅 kun belgilanmagan';
      msg += `\n👤 ${s.name}\n   O'tildi: ${pay.chargedCount} ta dars | Qoldiq: ${fmtMoney(pay.remaining)}\n   ${due}\n`;
      kb.text(`📅 ${s.name}`, `payd:${s.id}`).row();
    }
    msg += "\nTo'lov kunini belgilash uchun o'quvchini tanlang.\nBot ota-onaga 3 kun oldin va o'sha kuni eslatadi.";
    await ctx.reply(msg, { reply_markup: kb });
  }

  private async handleStateStep(ctx: Context, chatId: string, st: any, text?: string) {
    // Ertalabki tasdiqda bugungi dars vaqtini kiritish
    if (st.step === 'daytime_time' && text) {
      const t = parseTime(text);
      if (!t) {
        await ctx.reply("❌ Format noto'g'ri. Masalan: 15:30");
        return;
      }
      await this.lessons.setTime(st.groupId, todayDayOfWeek(), text);
      this.state.clear(chatId);
      await ctx.reply(`✅ Bugungi dars ${text} ga o'rnatildi. O'quvchilarga xabar yuborilmoqda...`, {
        reply_markup: adminMenu(),
      });
      await this.broadcastToStudents(
        ctx.api,
        st.groupId,
        `📚 Bugun darsimiz bor!\n🕐 Soat ${text} da boshlanadi. Tayyor bo'ling 💪`,
      );
      await ctx.reply("📨 O'quvchilarga xabar yuborildi.");
      return;
    }

    // Uyga vazifa matni
    if (st.step === 'homework_text' && text) {
      const preview = this.formatHomework(st.lessonNumber, text);
      this.state.set(chatId, { ...st, step: 'homework_confirm', text });
      await ctx.reply('Guruhga shunday ko‘rinishda yuboriladi:', { reply_markup: adminMenu() });
      await ctx.reply(preview, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('✅ Guruhga yuborish', 'hw:send')
          .row()
          .text('✏️ Qayta yozish', 'hw:redo')
          .text('❌ Bekor qilish', 'hw:cancel'),
      });
      return;
    }

    // To'lov kunini belgilash (har oyning N-kuni)
    if (st.step === 'pay_due' && text) {
      const student = await this.users.byId(st.studentId);
      if (!student) {
        this.state.clear(chatId);
        await ctx.reply('❌ O‘quvchi topilmadi.', { reply_markup: adminMenu() });
        return;
      }
      if (text === '-') {
        await this.payments.setDueDay(st.studentId, null);
        this.state.clear(chatId);
        await ctx.reply(`✅ ${student.name} uchun to'lov kuni o'chirildi.`, { reply_markup: adminMenu() });
        return;
      }
      const day = parseInt(text, 10);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        await ctx.reply("❌ 1 dan 31 gacha kun raqamini kiriting (masalan: 5). Bekor qilish uchun «-» yozing.");
        return;
      }
      await this.payments.setDueDay(st.studentId, day);
      this.state.clear(chatId);
      await ctx.reply(
        `✅ ${student.name} uchun to'lov kuni: har oyning ${day}-kuni.\nOta-onaga 3 kun oldin va o'sha kuni eslatma boradi.`,
        { reply_markup: adminMenu() },
      );
      return;
    }

    // Dars vaqtini o'zgartirish
    if (st.step === 'sched_time' && text) {
      const t = parseTime(text);
      if (!t) {
        await ctx.reply("❌ Format noto'g'ri. Masalan: 18:30");
        return;
      }
      await this.lessons.setTime(st.groupId, st.dow, text);
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
        const groupId = await this.getActiveGroupId(chatId);
        const task = await this.tasks.create({
          groupId,
          type: 'quiz',
          title: st.title,
          coinReward: reward,
          isActive: false,
        });
        this.state.set(chatId, { step: 'quiz_q', taskId: task.id, count: 0, groupId });
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
      const groupId = await this.getActiveGroupId(chatId);
      const task = await this.tasks.create({
        groupId,
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
        groupId,
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
          st.groupId,
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
      await this.broadcastToAllStudents(ctx.api, `🛍 Coinshopda yangi sovg'a: ${item.name} — ${item.price} coin!`);
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

  private async showStudents(ctx: Context, groupId: number) {
    const students = await this.users.listByRole('student', groupId);
    if (!students.length) {
      await ctx.reply("📭 Hali o'quvchilar yo'q.");
      return;
    }
    for (const s of students) {
      const balance = await this.coins.balance(s.id);
      const pay = await this.payments.status(s.id);
      await ctx.reply(
        `👤 ${s.name}\n💰 ${balance} coin | 💳 qoldiq ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars)`,
        { reply_markup: new InlineKeyboard().text("🗑 O'chirish", `stu:del:${s.id}`) },
      );
    }
  }

  private async handleDeleteStudent(ctx: Context, data: string) {
    const studentId = parseInt(data.split(':')[2], 10);

    if (data.startsWith('stu:del:')) {
      const student = await this.users.byId(studentId);
      if (!student) {
        await ctx.answerCallbackQuery({ text: 'Topilmadi' });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard()
          .text("⚠️ Ha, o'chirish", `stu:delconfirm:${studentId}`)
          .text('❌ Bekor', `stu:delcancel:${studentId}`),
      }).catch(() => undefined);
      return;
    }

    if (data.startsWith('stu:delcancel:')) {
      await ctx.answerCallbackQuery({ text: 'Bekor qilindi' });
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text("🗑 O'chirish", `stu:del:${studentId}`),
      }).catch(() => undefined);
      return;
    }

    if (data.startsWith('stu:delconfirm:')) {
      const student = await this.users.byId(studentId);
      if (!student) {
        await ctx.answerCallbackQuery({ text: 'Topilmadi' });
        return;
      }
      const parents = await this.users.parentsOfStudent(studentId);
      await this.users.remove(studentId);
      await ctx.answerCallbackQuery({ text: "O'chirildi" });
      await ctx.editMessageText(`🗑 ${student.name} o'quvchilar ro'yxatidan o'chirildi.`).catch(() => undefined);
      for (const parent of parents) {
        await ctx.api
          .sendMessage(
            parent.telegramId,
            `ℹ️ ${student.name} kursdan chiqarildi. Sizga oid ma'lumotlar botdan o'chirildi.`,
          )
          .catch(() => undefined);
      }
      return;
    }
  }

  private async showSchedule(ctx: Context, groupId: number) {
    const rows = await this.lessons.getSchedule(groupId);
    const kb = new InlineKeyboard();
    let msg = '🕐 Dars jadvali (Toshkent vaqti):\n\n';
    for (const r of rows) {
      msg += `${DAY_NAMES[r.dayOfWeek]} — ${r.lessonTime}\n`;
      kb.text(`✏️ ${DAY_NAMES[r.dayOfWeek]}`, `sched:${groupId}:${r.dayOfWeek}`).row();
    }
    msg += "\nVaqtni o'zgartirish uchun kunni tanlang:";
    await ctx.reply(msg, { reply_markup: kb });
  }

  private async showSubmissions(ctx: Context, groupId: number) {
    const rows = await this.tasks.pendingSubmissions(groupId);
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
    let msg = '🛍 Coinshop sovg‘alari (barcha guruhlar uchun umumiy):\n\n';
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

  private async showReport(ctx: Context, groupId: number) {
    const students = await this.users.listByRole('student', groupId);
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

    if (data.startsWith('stu:')) {
      return this.handleDeleteStudent(ctx, data);
    }

    if (data.startsWith('group:switch:')) {
      const groupId = parseInt(data.split(':')[2], 10);
      const group = await this.courseGroups.byId(groupId);
      if (!group) {
        await ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
        return;
      }
      await this.settings.set(`active_group:${chatId}`, String(groupId));
      await ctx.answerCallbackQuery({ text: `Tanlandi: ${group.name}` });
      await ctx.editMessageText(`✅ Joriy guruh: «${group.name}»`).catch(() => undefined);
      return;
    }

    if (data.startsWith('lessonend:start:')) {
      const groupId = parseInt(data.split(':')[2], 10);
      if (!(await this.lessons.scheduleForDay(groupId, todayDayOfWeek()))) {
        await ctx.answerCallbackQuery({ text: 'Bugun dars kuni emas!', show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await this.finalizeLesson(ctx, groupId);
      return;
    }

    // Ertalabki dars vaqti tasdig'i
    if (data.startsWith('daytime:ok:')) {
      const groupId = parseInt(data.split(':')[2], 10);
      const sched = await this.lessons.scheduleForDay(groupId, todayDayOfWeek());
      if (!sched) {
        await ctx.answerCallbackQuery({ text: 'Bugun dars kuni emas' });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(`✅ Tasdiqlandi: bugun ${sched.lessonTime} da dars. O'quvchilarga xabar yuborilmoqda...`).catch(() => undefined);
      await this.broadcastToStudents(
        ctx.api,
        groupId,
        `📚 Bugun darsimiz bor!\n🕐 Soat ${sched.lessonTime} da boshlanadi. Tayyor bo'ling 💪`,
      );
      await ctx.reply("📨 O'quvchilarga xabar yuborildi.");
      return;
    }

    if (data.startsWith('daytime:edit:')) {
      const groupId = parseInt(data.split(':')[2], 10);
      this.state.set(chatId, { step: 'daytime_time', groupId });
      await ctx.answerCallbackQuery();
      await ctx.reply('🕐 Bugungi dars vaqtini kiriting (masalan 15:30):', {
        reply_markup: cancelKeyboard(),
      });
      return;
    }

    // Uyga vazifa tasdig'i
    if (data === 'hw:send' || data === 'hw:redo' || data === 'hw:cancel') {
      return this.handleHomeworkCallback(ctx, data);
    }

    if (data.startsWith('payd:')) {
      const studentId = parseInt(data.split(':')[1], 10);
      const student = await this.users.byId(studentId);
      if (!student) {
        await ctx.answerCallbackQuery({ text: 'Topilmadi' });
        return;
      }
      this.state.set(chatId, { step: 'pay_due', studentId });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `📅 ${student.name} uchun har oyning to'lov kunini kiriting (1-31 oralig'ida raqam):\n\nMasalan: 5\nKunni o'chirish uchun «-» yuboring.`,
        { reply_markup: cancelKeyboard() },
      );
      return;
    }

    if (data.startsWith('sched:')) {
      const [, groupIdStr, dowStr] = data.split(':');
      const groupId = parseInt(groupIdStr, 10);
      const dow = parseInt(dowStr, 10);
      this.state.set(chatId, { step: 'sched_time', groupId, dow });
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
  async finalizeLesson(ctx: { api: Api; reply?: any } & Context, groupId: number) {
    const dateStr = todayDate();
    const lesson = await this.lessons.ensureLessonForDate(groupId, dateStr);
    const n = await this.lessons.lessonNumber(groupId, lesson);
    const students = await this.users.listByRole('student', groupId);
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
    const status: AttStatus =
      code === 'came' ? 'came' : code === 'unexc' ? 'missed_unexcused' : 'missed_excused';

    let result;
    try {
      result = await this.lessonFlow.markAttendance(lessonId, studentId, status);
    } catch {
      await ctx.answerCallbackQuery({ text: 'Topilmadi' });
      return;
    }
    const { student, paymentNote } = result;

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

  // ── Uyga vazifa ─────────────────────────────────────────────────────────────
  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private formatHomework(lessonNumber: number, text: string): string {
    const [y, m, d] = todayDate().split('-').map(Number);
    const months = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
    return (
      `📚 <b>UYGA VAZIFA</b>\n` +
      `🗓 ${d}-${months[m - 1]} · ${lessonNumber}-dars\n\n` +
      `${this.escapeHtml(text.trim())}\n\n` +
      `✅ Bajarib bo‘lgach, botdagi «${BTN.TASKS.trim()}» bo‘limi orqali topshiring.\n` +
      `💪 Omad!`
    );
  }

  private async handleHomeworkCallback(ctx: Context, data: string) {
    const chatId = String(ctx.chat!.id);
    const st = this.state.get(chatId);

    if (data === 'hw:cancel') {
      if (st?.groupId != null) await this.settings.set(`homework_pending:${st.groupId}`, '');
      this.state.clear(chatId);
      await ctx.answerCallbackQuery({ text: 'Bekor qilindi' });
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }

    if (data === 'hw:redo') {
      if (!st) {
        await ctx.answerCallbackQuery({ text: 'Sessiya eskirgan' });
        return;
      }
      this.state.set(chatId, { ...st, step: 'homework_text' });
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await ctx.reply('📝 Uyga vazifani qaytadan yozib yuboring:');
      return;
    }

    // hw:send
    if (!st || st.step !== 'homework_confirm' || !st.text) {
      await ctx.answerCallbackQuery({ text: 'Sessiya eskirgan. Qaytadan yozing.' });
      return;
    }
    const group = st.groupId != null ? await this.courseGroups.byId(st.groupId as number) : undefined;
    if (!group?.telegramChatId) {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `❌ «${group?.name ?? 'Guruh'}» uchun Telegram e'lon chati ulanmagan!\n\nMini app orqali guruh sozlamalaridan chatni bog'lang. Keyin shu tugmani qayta bosing.`,
      );
      return;
    }
    try {
      await ctx.api.sendMessage(group.telegramChatId, this.formatHomework(st.lessonNumber as number, st.text as string), {
        parse_mode: 'HTML',
      });
    } catch {
      await ctx.answerCallbackQuery();
      await ctx.reply("❌ Guruhga yuborib bo'lmadi. Bot guruhda admin ekanini tekshiring.");
      return;
    }
    if (st.groupId != null) await this.settings.set(`homework_pending:${st.groupId}`, '');
    this.state.clear(chatId);
    await ctx.answerCallbackQuery({ text: 'Yuborildi ✅' });
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await ctx.reply('✅ Uyga vazifa guruhga yuborildi!');
  }

  // ── Yordamchilar ────────────────────────────────────────────────────────────
  async broadcastToStudents(api: Api, groupId: number, text: string) {
    const students = await this.users.listByRole('student', groupId);
    for (const s of students) {
      await api.sendMessage(s.telegramId, text).catch(() => undefined);
    }
  }

  async broadcastToAllStudents(api: Api, text: string) {
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
