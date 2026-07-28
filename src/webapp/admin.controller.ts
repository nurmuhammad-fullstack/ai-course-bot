import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DAY_NAMES, parseTime, todayDate, todayDayOfWeek } from '../bot/format';
import { CoinsRepo } from '../repos/coins.repo';
import { CourseGroupsRepo } from '../repos/course-groups.repo';
import { LessonsRepo } from '../repos/lessons.repo';
import { PaymentsRepo } from '../repos/payments.repo';
import { ShopRepo } from '../repos/shop.repo';
import { TasksRepo } from '../repos/tasks.repo';
import { UsersRepo } from '../repos/users.repo';
import { AttStatus, LessonFlowService } from '../services/lesson-flow.service';
import { NotifyService } from '../services/notify.service';
import { AdminGuard, TgAuthGuard } from './auth.guard';

const ATT_STATUSES: AttStatus[] = ['came', 'missed_unexcused', 'missed_excused'];

/** Coinshop kartalarida ishlatiladigan katta ikonkalar to'plami */
const SHOP_ICONS = [
  'gift', 'code', 'brain', 'headphones', 'mouse', 'keyboard',
  'usb', 'power', 'globe', 'trophy', 'badge', 'certificate',
];

@Controller('api/admin')
@UseGuards(TgAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly users: UsersRepo,
    private readonly payments: PaymentsRepo,
    private readonly coins: CoinsRepo,
    private readonly lessons: LessonsRepo,
    private readonly tasks: TasksRepo,
    private readonly shop: ShopRepo,
    private readonly notify: NotifyService,
    private readonly lessonFlow: LessonFlowService,
    private readonly courseGroups: CourseGroupsRepo,
  ) {}

  private async pendingRequests() {
    const pending = await this.users.listByRole('pending');
    return pending.filter((u) => u.name && u.phone);
  }

  /** Query'da groupId kelmasa — birinchi faol guruh ("Asosiy guruh") ga tushadi */
  private async resolveGroupId(groupId?: number): Promise<number> {
    if (groupId != null && Number.isInteger(groupId)) return groupId;
    const groups = await this.courseGroups.list();
    if (!groups.length) throw new BadRequestException("Hali birorta guruh yo'q");
    return groups[0].id;
  }

  // ── Guruhlar ────────────────────────────────────────────────────────────────
  @Get('groups')
  async listGroups() {
    return this.courseGroups.list();
  }

  @Post('groups')
  async createGroup(
    @Body()
    body: {
      name?: string;
      totalPrice?: number;
      lessonsCount?: number;
      telegramChatId?: string;
      schedule?: { dayOfWeek?: number; lessonTime?: string }[];
    },
  ) {
    const name = body?.name?.trim();
    const totalPrice = Number(body?.totalPrice);
    const lessonsCount = Number(body?.lessonsCount);
    if (!name || name.length > 100) throw new BadRequestException("Noto'g'ri guruh nomi");
    if (!Number.isInteger(totalPrice) || totalPrice <= 0) {
      throw new BadRequestException("Noto'g'ri narx");
    }
    if (!Number.isInteger(lessonsCount) || lessonsCount <= 0 || lessonsCount > 100) {
      throw new BadRequestException("Noto'g'ri dars soni");
    }

    let scheduleRows: { dayOfWeek: number; lessonTime: string }[] | undefined;
    if (body?.schedule?.length) {
      if (body.schedule.length > 7) throw new BadRequestException("Dars kunlari ko'pi bilan 7 ta");
      const seen = new Set<number>();
      scheduleRows = body.schedule.map((r) => {
        const dayOfWeek = Number(r?.dayOfWeek);
        const lessonTime = r?.lessonTime?.trim();
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !lessonTime || !parseTime(lessonTime)) {
          throw new BadRequestException("Noto'g'ri dars kuni/vaqti");
        }
        if (seen.has(dayOfWeek)) throw new BadRequestException("Bir xil kun ikki marta tanlangan");
        seen.add(dayOfWeek);
        return { dayOfWeek, lessonTime };
      });
    }

    const group = await this.courseGroups.create({
      name,
      totalPrice,
      lessonsCount,
      telegramChatId: body?.telegramChatId?.trim() || null,
    });
    await this.lessons.seedSchedule(group.id, scheduleRows);
    return group;
  }

  @Put('groups/:id')
  async updateGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { name?: string; totalPrice?: number; lessonsCount?: number; telegramChatId?: string | null },
  ) {
    const group = await this.courseGroups.byId(id);
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 100) throw new BadRequestException("Noto'g'ri guruh nomi");
      patch.name = name;
    }
    if (body.totalPrice !== undefined) {
      const totalPrice = Number(body.totalPrice);
      if (!Number.isInteger(totalPrice) || totalPrice <= 0) throw new BadRequestException("Noto'g'ri narx");
      patch.totalPrice = totalPrice;
    }
    if (body.lessonsCount !== undefined) {
      const lessonsCount = Number(body.lessonsCount);
      if (!Number.isInteger(lessonsCount) || lessonsCount <= 0) throw new BadRequestException("Noto'g'ri dars soni");
      patch.lessonsCount = lessonsCount;
    }
    if (body.telegramChatId !== undefined) {
      patch.telegramChatId = body.telegramChatId?.trim() || null;
    }
    return this.courseGroups.update(id, patch);
  }

  @Post('groups/:id/deactivate')
  async deactivateGroup(@Param('id', ParseIntPipe) id: number) {
    const group = await this.courseGroups.byId(id);
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const students = await this.users.listByRole('student', id);
    if (students.length) {
      throw new BadRequestException(
        `Bu guruhda ${students.length} ta o'quvchi bor — avval ularni boshqa guruhga o'tkazing yoki o'chiring`,
      );
    }
    const groups = await this.courseGroups.list();
    if (groups.length <= 1) {
      throw new BadRequestException("Kamida bitta faol guruh qolishi kerak");
    }
    await this.courseGroups.deactivate(id);
    return { ok: true };
  }

  // ── Bosh sahifa ─────────────────────────────────────────────────────────────
  @Get('home')
  async home(@Query('groupId') groupIdRaw?: string) {
    const groupId = await this.resolveGroupId(groupIdRaw ? Number(groupIdRaw) : undefined);
    const dayOfWeek = todayDayOfWeek();
    const todaySchedule = await this.lessons.scheduleForDay(groupId, dayOfWeek);
    const schedule = await this.lessons.getSchedule(groupId);
    const requests = await this.pendingRequests();
    const submissions = await this.tasks.pendingSubmissions(groupId);
    const orders = await this.shop.pendingOrders();
    const students = await this.users.listByRole('student', groupId);
    const totalCoins = await this.coins.totalBalance();
    return {
      today: {
        dayOfWeek,
        dayName: DAY_NAMES[dayOfWeek],
        lessonTime: todaySchedule?.lessonTime ?? null,
        isLessonDay: !!todaySchedule,
      },
      schedule: schedule.map((s) => ({ dayOfWeek: s.dayOfWeek, lessonTime: s.lessonTime })),
      counts: {
        requests: requests.length,
        submissions: submissions.length,
        orders: orders.length,
      },
      studentsCount: students.length,
      totalCoins,
    };
  }

  @Put('schedule')
  async setSchedule(
    @Body() body: { groupId?: number; dayOfWeek?: number; lessonTime?: string },
  ) {
    const groupId = await this.resolveGroupId(body?.groupId);
    const dayOfWeek = Number(body?.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || !body?.lessonTime || !parseTime(body.lessonTime)) {
      throw new BadRequestException("Noto'g'ri jadval ma'lumoti");
    }
    await this.lessons.setTime(groupId, dayOfWeek, body.lessonTime.trim());
    return { ok: true };
  }

  // ── Dars / davomat ──────────────────────────────────────────────────────────
  @Post('lesson/finish')
  async finishLesson(@Body() body: { groupId?: number }) {
    const groupId = await this.resolveGroupId(body?.groupId);
    const sched = await this.lessons.scheduleForDay(groupId, todayDayOfWeek());
    if (!sched) {
      throw new BadRequestException("Bugun dars kuni emas — darsni yakunlab bo'lmaydi");
    }
    const lesson = await this.lessons.ensureLessonForDate(groupId, todayDate());
    const lessonNumber = await this.lessons.lessonNumber(groupId, lesson);
    const students = await this.users.listByRole('student', groupId);
    const att = await this.lessons.attendanceForLesson(lesson.id);
    return {
      lessonId: lesson.id,
      lessonNumber,
      date: lesson.lessonDate,
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        attendance: att.get(s.id) ?? null,
      })),
    };
  }

  @Post('attendance')
  async markAttendance(@Body() body: { lessonId?: number; studentId?: number; status?: string }) {
    const lessonId = Number(body?.lessonId);
    const studentId = Number(body?.studentId);
    const status = body?.status as AttStatus;
    if (!Number.isInteger(lessonId) || !Number.isInteger(studentId) || !ATT_STATUSES.includes(status)) {
      throw new BadRequestException("Noto'g'ri davomat ma'lumoti");
    }
    const result = await this.lessonFlow.markAttendance(lessonId, studentId, status).catch((e) => {
      if (e instanceof Error && e.message === 'Topilmadi') {
        throw new NotFoundException('Dars yoki o‘quvchi topilmadi');
      }
      throw e;
    });
    return {
      ok: true,
      paymentNote: result.paymentNote,
      remaining: result.pay.remaining,
      lessonsLeft: result.pay.lessonsLeft,
    };
  }

  // ── Zaproslar ───────────────────────────────────────────────────────────────
  @Get('requests')
  async requests() {
    const pending = await this.pendingRequests();
    return pending.map((u) => ({ id: u.id, name: u.name, phone: u.phone, username: u.username }));
  }

  @Post('requests/:id')
  async decideRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { action?: string; studentId?: number; groupId?: number },
  ) {
    const user = await this.users.byId(id);
    if (!user) throw new NotFoundException('Zapros topilmadi');

    if (body?.action === 'student') {
      const groupId = await this.resolveGroupId(body?.groupId);
      await this.users.setRole(user.id, 'student');
      await this.users.setGroup(user.id, groupId);
      await this.payments.ensure(user.id, groupId);
      await this.notify.send(
        user.telegramId,
        "🎉 Tabriklaymiz! Siz o'quvchi sifatida tasdiqlandingiz.\n\nMenyu ochilishi uchun botga /start yozing.",
      );
      return { ok: true };
    }

    if (body?.action === 'parent') {
      const studentId = Number(body?.studentId);
      if (!Number.isInteger(studentId)) throw new BadRequestException('studentId shart');
      const student = await this.users.byId(studentId);
      if (!student || student.role !== 'student') {
        throw new BadRequestException('O‘quvchi topilmadi');
      }
      await this.users.setRole(user.id, 'parent');
      await this.users.linkParent(user.id, studentId);
      await this.notify.send(
        user.telegramId,
        `🎉 Siz ${student.name} ning ota-onasi sifatida tasdiqlandingiz.\n\nMenyu ochilishi uchun botga /start yozing.`,
      );
      return { ok: true };
    }

    if (body?.action === 'reject') {
      await this.notify.send(
        user.telegramId,
        "❌ Afsuski, so'rovingiz rad etildi. Savollar bo'lsa admin bilan bog'laning.",
      );
      await this.users.remove(user.id);
      return { ok: true };
    }

    throw new BadRequestException("Noto'g'ri action");
  }

  // ── O'quvchilar ─────────────────────────────────────────────────────────────
  @Get('students')
  async students(@Query('groupId') groupIdRaw?: string, @Query('allGroups') allGroups?: string) {
    const groupId = allGroups === '1'
      ? undefined
      : await this.resolveGroupId(groupIdRaw ? Number(groupIdRaw) : undefined);
    const students = await this.users.listByRole('student', groupId);
    const result = [];
    for (const s of students) {
      const [coins, pay, att, parents] = await Promise.all([
        this.coins.balance(s.id),
        this.payments.status(s.id),
        this.lessons.attendanceForStudent(s.id),
        this.users.parentsOfStudent(s.id),
      ]);
      result.push({
        id: s.id,
        name: s.name,
        phone: s.phone,
        hasParent: parents.length > 0,
        parentNames: parents.map((p) => p.name).filter(Boolean),
        coins,
        pay,
        attendance: {
          came: att.filter((a) => a.status === 'came').length,
          missed: att.filter((a) => a.status !== 'came').length,
        },
      });
    }
    return result;
  }

  @Get('students/:id/coins')
  async studentCoinHistory(@Param('id', ParseIntPipe) id: number) {
    const student = await this.users.byId(id);
    if (!student || student.role !== 'student') throw new NotFoundException("O'quvchi topilmadi");
    const [balance, history] = await Promise.all([
      this.coins.balance(id),
      this.coins.history(id, 30),
    ]);
    return {
      balance,
      history: history.map((h) => ({ amount: h.amount, reason: h.reason, createdAt: h.createdAt })),
    };
  }

  @Post('students/:id/coins')
  async adjustStudentCoins(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount?: number; reason?: string },
  ) {
    const student = await this.users.byId(id);
    if (!student || student.role !== 'student') throw new NotFoundException("O'quvchi topilmadi");
    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount === 0) {
      throw new BadRequestException("Noto'g'ri miqdor");
    }
    const reason = body?.reason?.trim().slice(0, 200) || (amount > 0 ? 'Admin tomonidan qo\'shildi' : 'Admin tomonidan ayirildi');
    await this.coins.add(id, amount, reason);
    const balance = await this.coins.balance(id);
    if (balance < 0) {
      // Manfiy balansga ruxsat bermaymiz — ortga qaytaramiz
      await this.coins.add(id, -amount, `Bekor qilindi (balans manfiy bo'lib qolardi): ${reason}`);
      throw new BadRequestException("Bu amaldan so'ng balans manfiy bo'lib qoladi");
    }
    await this.notify.send(
      student.telegramId,
      amount > 0
        ? `💰 Sizga ${amount} coin qo'shildi!\nSabab: ${reason}\nBalans: ${balance} coin`
        : `💰 Sizdan ${Math.abs(amount)} coin ayirildi.\nSabab: ${reason}\nBalans: ${balance} coin`,
    );
    return { ok: true, balance };
  }

  @Post('students/:id/delete')
  async deleteStudent(@Param('id', ParseIntPipe) id: number) {
    const student = await this.users.byId(id);
    if (!student || student.role !== 'student') {
      throw new NotFoundException("O'quvchi topilmadi");
    }
    const parents = await this.users.parentsOfStudent(id);
    await this.users.remove(id);
    await this.notify.toAdmin(`🗑 ${student.name} o'quvchilar ro'yxatidan o'chirildi.`);
    for (const parent of parents) {
      await this.notify.send(
        parent.telegramId,
        `ℹ️ ${student.name} kursdan chiqarildi. Sizga oid ma'lumotlar botdan o'chirildi.`,
      );
    }
    return { ok: true };
  }

  // ── To'lov kuni (har oyning N-kuni) ──────────────────────────────────────────
  @Put('payments/:studentId')
  async setDueDay(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() body: { dueDay?: number | null },
  ) {
    const student = await this.users.byId(studentId);
    if (!student || student.role !== 'student') throw new NotFoundException("O'quvchi topilmadi");
    const raw = body.dueDay ?? null;
    if (raw === null) {
      await this.payments.setDueDay(studentId, null);
      return { ok: true };
    }
    const day = Number(raw);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException("Kun 1 dan 31 gacha bo'lishi kerak");
    }
    await this.payments.setDueDay(studentId, day);
    return { ok: true };
  }

  // ── Vazifalar ───────────────────────────────────────────────────────────────
  @Get('tasks')
  async listTasks(@Query('groupId') groupIdRaw?: string) {
    const groupId = await this.resolveGroupId(groupIdRaw ? Number(groupIdRaw) : undefined);
    const tasks = await this.tasks.listActive(groupId);
    const result = [];
    for (const t of tasks) {
      const questions = t.type === 'quiz' ? await this.tasks.questions(t.id) : [];
      result.push({
        id: t.id,
        type: t.type,
        title: t.title,
        coinReward: t.coinReward,
        isActive: t.isActive,
        questionsCount: questions.length,
      });
    }
    return result;
  }

  @Post('tasks')
  async createTask(
    @Body()
    body: {
      groupId?: number;
      type?: string;
      title?: string;
      description?: string;
      coinReward?: number;
      questions?: { question?: string; options?: string[]; correctIndex?: number }[];
    },
  ) {
    const groupId = await this.resolveGroupId(body?.groupId);
    const coinReward = Number(body?.coinReward);
    if (!body?.title?.trim() || !Number.isInteger(coinReward) || coinReward <= 0) {
      throw new BadRequestException("Noto'g'ri vazifa ma'lumoti");
    }
    if (body.title.trim().length > 200) throw new BadRequestException('Nom juda uzun (max 200)');
    if (coinReward > 100000) throw new BadRequestException('Coin mukofoti juda katta');
    if ((body.description ?? '').length > 4000) throw new BadRequestException('Tavsif juda uzun (max 4000)');
    if ((body.questions?.length ?? 0) > 50) throw new BadRequestException("Savollar soni ko'pi bilan 50 ta");
    if (
      body.questions?.some(
        (q) =>
          (q.question ?? '').length > 1000 ||
          (q.options ?? []).length > 8 ||
          (q.options ?? []).some((o) => String(o).length > 300),
      )
    ) {
      throw new BadRequestException('Savol/variantlar juda uzun');
    }

    if (body.type === 'assignment') {
      const task = await this.tasks.create({
        groupId,
        type: 'assignment',
        title: body.title.trim(),
        description: body.description?.trim(),
        coinReward,
      });
      await this.notify.broadcastToStudents(
        `🎯 Yangi vazifa: ${task.title}\n\n${task.description ?? ''}\n\n💰 Mukofot: ${task.coinReward} coin\n\n«🎯 Vazifalar» bo'limidan topshiring!`,
      );
      return { ok: true, id: task.id };
    }

    if (body.type === 'quiz') {
      const questions = body.questions ?? [];
      if (
        !questions.length ||
        questions.some(
          (q) =>
            !q.question?.trim() ||
            !Array.isArray(q.options) ||
            q.options.length < 2 ||
            !Number.isInteger(q.correctIndex) ||
            q.correctIndex! < 0 ||
            q.correctIndex! >= q.options.length,
        )
      ) {
        throw new BadRequestException("Noto'g'ri test savollari");
      }
      const task = await this.tasks.create({
        groupId,
        type: 'quiz',
        title: body.title.trim(),
        coinReward,
      });
      for (const q of questions) {
        await this.tasks.addQuestion(task.id, q.question!.trim(), q.options!, q.correctIndex!);
      }
      await this.notify.broadcastToStudents(
        `🎯 Yangi test: ${task.title} (${questions.length} ta savol)\n💰 Mukofot: ${task.coinReward} coin gacha\n\n«🎯 Vazifalar» bo'limidan ishlang!`,
      );
      return { ok: true, id: task.id };
    }

    throw new BadRequestException("Noto'g'ri type");
  }

  @Post('tasks/:id/deactivate')
  async deactivateTask(@Param('id', ParseIntPipe) id: number) {
    await this.tasks.deactivate(id);
    return { ok: true };
  }

  // ── Topshiriqlar ────────────────────────────────────────────────────────────
  @Get('submissions')
  async submissions(@Query('groupId') groupIdRaw?: string) {
    const groupId = groupIdRaw ? Number(groupIdRaw) : undefined;
    const rows = await this.tasks.pendingSubmissions(groupId);
    return rows.map(({ submission, task, student }) => ({
      id: submission.id,
      taskTitle: task.title,
      coinReward: task.coinReward,
      studentName: student.name,
      contentType: submission.contentType,
      content: submission.content,
      createdAt: submission.createdAt,
    }));
  }

  @Post('submissions/:id')
  async decideSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { action?: string },
  ) {
    const row = await this.tasks.submissionById(id);
    if (!row) throw new NotFoundException('Topshiriq topilmadi');
    const { submission, task, student } = row;
    if (submission.status !== 'pending') throw new BadRequestException('Allaqachon ko‘rilgan');

    if (body?.action === 'approve') {
      await this.tasks.setSubmissionStatus(submission.id, 'approved');
      await this.coins.add(student.id, task.coinReward, `Vazifa: ${task.title}`);
      const balance = await this.coins.balance(student.id);
      await this.notify.send(
        student.telegramId,
        `🎉 «${task.title}» vazifangiz qabul qilindi!\n💰 +${task.coinReward} coin. Balans: ${balance} coin`,
      );
      return { ok: true };
    }

    if (body?.action === 'reject') {
      await this.tasks.setSubmissionStatus(submission.id, 'rejected');
      await this.notify.send(
        student.telegramId,
        `❌ «${task.title}» vazifangiz rad etildi. Qayta ishlab, yana topshirishingiz mumkin.`,
      );
      return { ok: true };
    }

    throw new BadRequestException("Noto'g'ri action");
  }

  // ── Coinshop (umumiy, guruhdan mustaqil) ─────────────────────────────────────
  @Get('shop')
  async shopOverview() {
    const items = await this.shop.listActive();
    const orders = await this.shop.pendingOrders();
    return {
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        icon: i.icon,
        imageUrl: i.imageUrl,
        description: i.description,
      })),
      orders: orders.map(({ order, item, student }) => ({
        id: order.id,
        itemName: item.name,
        price: item.price,
        studentName: student.name,
      })),
    };
  }

  @Post('shop')
  async addShopItem(
    @Body() body: { name?: string; price?: number; icon?: string; description?: string },
  ) {
    const price = Number(body?.price);
    if (!body?.name?.trim() || !Number.isInteger(price) || price <= 0) {
      throw new BadRequestException("Noto'g'ri sovg'a ma'lumoti");
    }
    if (body.name.trim().length > 200 || price > 1000000) {
      throw new BadRequestException("Nom yoki narx chegaradan oshgan");
    }
    const icon = SHOP_ICONS.includes(body.icon ?? '') ? (body.icon as string) : 'gift';
    const description = body.description?.trim().slice(0, 300);
    const item = await this.shop.addItem(body.name.trim(), price, icon, description);
    await this.notify.broadcastToStudents(
      `🛍 Coinshopda yangi sovg'a: ${item.name} — ${item.price} coin!`,
    );
    return { ok: true };
  }

  @Post('shop/:id/deactivate')
  async deactivateShopItem(@Param('id', ParseIntPipe) id: number) {
    await this.shop.deactivateItem(id);
    return { ok: true };
  }

  @Post('orders/:id')
  async decideOrder(@Param('id', ParseIntPipe) id: number, @Body() body: { action?: string }) {
    const row = await this.shop.orderById(id);
    if (!row) throw new NotFoundException('Buyurtma topilmadi');
    const { order, item, student } = row;
    if (order.status !== 'pending') throw new BadRequestException('Allaqachon ko‘rilgan');

    if (body?.action === 'give') {
      await this.shop.setOrderStatus(order.id, 'given');
      await this.notify.send(
        student.telegramId,
        `🎁 «${item.name}» sovg'angiz tayyor! Ustozdan olib keting.`,
      );
      return { ok: true };
    }

    if (body?.action === 'reject') {
      await this.shop.setOrderStatus(order.id, 'rejected');
      await this.coins.add(student.id, item.price, `Buyurtma bekor: ${item.name} (coin qaytdi)`);
      const balance = await this.coins.balance(student.id);
      await this.notify.send(
        student.telegramId,
        `❌ «${item.name}» buyurtmangiz bekor qilindi. ${item.price} coin qaytarildi. Balans: ${balance} coin`,
      );
      return { ok: true };
    }

    throw new BadRequestException("Noto'g'ri action");
  }
}
