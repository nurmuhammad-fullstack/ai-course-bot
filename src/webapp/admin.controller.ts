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
  UseGuards,
} from '@nestjs/common';
import { DAY_NAMES, parseTime, todayDate, todayDayOfWeek } from '../bot/format';
import { CoinsRepo } from '../repos/coins.repo';
import { LessonsRepo } from '../repos/lessons.repo';
import { PaymentsRepo } from '../repos/payments.repo';
import { ShopRepo } from '../repos/shop.repo';
import { TasksRepo } from '../repos/tasks.repo';
import { UsersRepo } from '../repos/users.repo';
import { AttStatus, LessonFlowService } from '../services/lesson-flow.service';
import { NotifyService } from '../services/notify.service';
import { AdminGuard, TgAuthGuard } from './auth.guard';

const ATT_STATUSES: AttStatus[] = ['came', 'missed_unexcused', 'missed_excused'];

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
  ) {}

  private async pendingRequests() {
    const pending = await this.users.listByRole('pending');
    return pending.filter((u) => u.name && u.phone);
  }

  // ── Bosh sahifa ─────────────────────────────────────────────────────────────
  @Get('home')
  async home() {
    const dayOfWeek = todayDayOfWeek();
    const todaySchedule = await this.lessons.scheduleForDay(dayOfWeek);
    const schedule = await this.lessons.getSchedule();
    const requests = await this.pendingRequests();
    const submissions = await this.tasks.pendingSubmissions();
    const orders = await this.shop.pendingOrders();
    const students = await this.users.listByRole('student');
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
    };
  }

  @Put('schedule')
  async setSchedule(@Body() body: { dayOfWeek?: number; lessonTime?: string }) {
    const dayOfWeek = Number(body?.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || !body?.lessonTime || !parseTime(body.lessonTime)) {
      throw new BadRequestException("Noto'g'ri jadval ma'lumoti");
    }
    await this.lessons.setTime(dayOfWeek, body.lessonTime.trim());
    return { ok: true };
  }

  // ── Dars / davomat ──────────────────────────────────────────────────────────
  @Post('lesson/finish')
  async finishLesson() {
    const sched = await this.lessons.scheduleForDay(todayDayOfWeek());
    if (!sched) {
      throw new BadRequestException("Bugun dars kuni emas — darsni yakunlab bo'lmaydi");
    }
    const lesson = await this.lessons.ensureLessonForDate(todayDate());
    const lessonNumber = await this.lessons.lessonNumber(lesson);
    const students = await this.users.listByRole('student');
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
    @Body() body: { action?: string; studentId?: number },
  ) {
    const user = await this.users.byId(id);
    if (!user) throw new NotFoundException('Zapros topilmadi');

    if (body?.action === 'student') {
      await this.users.setRole(user.id, 'student');
      await this.payments.ensure(user.id);
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
  async students() {
    const students = await this.users.listByRole('student');
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

  // ── Vazifalar ───────────────────────────────────────────────────────────────
  @Get('tasks')
  async listTasks() {
    const tasks = await this.tasks.listActive();
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
      type?: string;
      title?: string;
      description?: string;
      coinReward?: number;
      questions?: { question?: string; options?: string[]; correctIndex?: number }[];
    },
  ) {
    const coinReward = Number(body?.coinReward);
    if (!body?.title?.trim() || !Number.isInteger(coinReward) || coinReward <= 0) {
      throw new BadRequestException("Noto'g'ri vazifa ma'lumoti");
    }

    if (body.type === 'assignment') {
      const task = await this.tasks.create({
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
  async submissions() {
    const rows = await this.tasks.pendingSubmissions();
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

  // ── Coinshop ────────────────────────────────────────────────────────────────
  @Get('shop')
  async shopOverview() {
    const items = await this.shop.listActive();
    const orders = await this.shop.pendingOrders();
    return {
      items: items.map((i) => ({ id: i.id, name: i.name, price: i.price })),
      orders: orders.map(({ order, item, student }) => ({
        id: order.id,
        itemName: item.name,
        price: item.price,
        studentName: student.name,
      })),
    };
  }

  @Post('shop')
  async addShopItem(@Body() body: { name?: string; price?: number }) {
    const price = Number(body?.price);
    if (!body?.name?.trim() || !Number.isInteger(price) || price <= 0) {
      throw new BadRequestException("Noto'g'ri sovg'a ma'lumoti");
    }
    const item = await this.shop.addItem(body.name.trim(), price);
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
