import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CoinsRepo } from '../repos/coins.repo';
import { LessonsRepo } from '../repos/lessons.repo';
import { PaymentsRepo } from '../repos/payments.repo';
import { ShopRepo } from '../repos/shop.repo';
import { TasksRepo } from '../repos/tasks.repo';
import { UsersRepo, User } from '../repos/users.repo';
import { NotifyService } from '../services/notify.service';
import { AuthedRequest, TgAuthGuard, TgUser } from './auth.guard';

@Controller('api')
@UseGuards(TgAuthGuard)
export class UserController {
  constructor(
    private readonly users: UsersRepo,
    private readonly payments: PaymentsRepo,
    private readonly coins: CoinsRepo,
    private readonly lessons: LessonsRepo,
    private readonly tasks: TasksRepo,
    private readonly shop: ShopRepo,
    private readonly notify: NotifyService,
  ) {}

  private requireStudent(user: User | null): User {
    if (!user || user.role !== 'student') throw new ForbiddenException("Faqat o'quvchi uchun");
    return user;
  }

  // ── Umumiy ──────────────────────────────────────────────────────────────────
  @Get('profile')
  profile(@Req() req: AuthedRequest, @TgUser() user: User | null) {
    if (req.isAdmin) {
      return { role: 'admin', name: user?.name ?? 'Admin', userId: user?.id ?? null };
    }
    if (!user) return { role: 'guest', name: null, userId: null };
    return { role: user.role, name: user.name, userId: user.id };
  }

  // ── O'quvchi ────────────────────────────────────────────────────────────────
  @Get('me')
  async me(@TgUser() tgUser: User | null) {
    const user = this.requireStudent(tgUser);
    const [coins, history, pay, attendance, schedule] = await Promise.all([
      this.coins.balance(user.id),
      this.coins.history(user.id),
      this.payments.status(user.id),
      this.lessons.attendanceForStudent(user.id),
      this.lessons.getSchedule(),
    ]);
    return {
      name: user.name,
      coins,
      history: history.map((h) => ({ amount: h.amount, reason: h.reason, createdAt: h.createdAt })),
      pay,
      attendance: attendance.map((a) => ({ lessonDate: a.lessonDate, status: a.status })),
      schedule: schedule.map((s) => ({ dayOfWeek: s.dayOfWeek, lessonTime: s.lessonTime })),
    };
  }

  @Get('tasks')
  async listTasks(@TgUser() tgUser: User | null) {
    const user = this.requireStudent(tgUser);
    const active = await this.tasks.listActive();
    const result = [];
    for (const task of active) {
      let status = 'new';
      let score: string | null = null;
      let questions:
        | { id: number; question: string; options: string[] }[]
        | undefined;

      if (task.type === 'quiz') {
        const res = await this.tasks.quizResult(task.id, user.id);
        if (res) {
          status = 'done';
          score = `${res.score}/${res.total}`;
        } else {
          const qs = await this.tasks.questions(task.id);
          questions = qs.map((q) => ({
            id: q.id,
            question: q.question,
            options: JSON.parse(q.options) as string[],
          }));
        }
      } else {
        const sub = await this.tasks.submissionFor(task.id, user.id);
        if (sub) status = sub.status; // pending | approved | rejected
      }

      result.push({
        id: task.id,
        type: task.type,
        title: task.title,
        description: task.description,
        coinReward: task.coinReward,
        status,
        score,
        ...(questions ? { questions } : {}),
      });
    }
    return result;
  }

  @Post('tasks/:id/quiz')
  async submitQuiz(
    @TgUser() tgUser: User | null,
    @Param('id', ParseIntPipe) taskId: number,
    @Body() body: { answers?: number[] },
  ) {
    const user = this.requireStudent(tgUser);
    const task = await this.tasks.byId(taskId);
    if (!task || !task.isActive || task.type !== 'quiz') {
      throw new NotFoundException('Test topilmadi');
    }
    const existing = await this.tasks.quizResult(taskId, user.id);
    if (existing) throw new BadRequestException('Siz bu testni allaqachon ishlagansiz');

    const questions = await this.tasks.questions(taskId);
    if (!questions.length) throw new BadRequestException("Testda savollar yo'q");
    const answers = body?.answers;
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      throw new BadRequestException("Javoblar soni savollar soniga teng bo'lishi kerak");
    }

    const score = questions.reduce(
      (acc, q, i) => acc + (Number(answers[i]) === q.correctIndex ? 1 : 0),
      0,
    );
    const total = questions.length;
    const coins = Math.round((task.coinReward * score) / total);

    // Race himoyasi: natija faqat birinchi marta saqlansa coin beriladi
    const saved = await this.tasks.saveQuizResult(taskId, user.id, score, total, coins);
    if (!saved) throw new BadRequestException('Siz bu testni allaqachon ishlagansiz');
    if (coins > 0) {
      await this.coins.add(user.id, coins, `Test: ${task.title} (${score}/${total})`);
    }
    const balance = await this.coins.balance(user.id);
    await this.notify.toAdmin(
      `📝 ${user.name} «${task.title}» testini ishladi: ${score}/${total} (+${coins} coin)`,
    );
    return { score, total, coins, balance };
  }

  @Post('tasks/:id/submit')
  async submitTask(
    @TgUser() tgUser: User | null,
    @Param('id', ParseIntPipe) taskId: number,
    @Body() body: { text?: string },
  ) {
    const user = this.requireStudent(tgUser);
    const task = await this.tasks.byId(taskId);
    if (!task || !task.isActive || task.type !== 'assignment') {
      throw new NotFoundException('Vazifa topilmadi');
    }
    const text = body?.text?.trim();
    if (!text) throw new BadRequestException('Matn kiriting');
    if (text.length > 4000) throw new BadRequestException('Matn juda uzun (maksimum 4000 belgi)');

    const existing = await this.tasks.submissionFor(taskId, user.id);
    if (existing?.status === 'approved') {
      throw new BadRequestException('Bu vazifa allaqachon qabul qilingan');
    }

    await this.tasks.upsertSubmission({
      taskId,
      studentId: user.id,
      contentType: 'text',
      content: text,
    });
    await this.notify.toAdmin(
      `📤 ${user.name} — «${task.title}» (+${task.coinReward} coin)\n\n📝 ${text}\n\nMini App orqali tekshiring.`,
    );
    return { ok: true };
  }

  @Get('shop')
  async shopList(@TgUser() tgUser: User | null) {
    const user = this.requireStudent(tgUser);
    const [balance, items] = await Promise.all([
      this.coins.balance(user.id),
      this.shop.listActive(),
    ]);
    return {
      balance,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        icon: i.icon,
        description: i.description,
      })),
    };
  }

  @Post('shop/:id/buy')
  async buyItem(@TgUser() tgUser: User | null, @Param('id', ParseIntPipe) itemId: number) {
    const user = this.requireStudent(tgUser);
    const item = await this.shop.itemById(itemId);
    if (!item || !item.isActive) throw new NotFoundException("Sovg'a topilmadi");

    const balance = await this.coins.balance(user.id);
    if (balance < item.price) {
      throw new BadRequestException(`Coin yetarli emas: ${balance}/${item.price}`);
    }

    await this.coins.add(user.id, -item.price, `Buyurtma: ${item.name}`);
    // Race himoyasi: parallel xaridlar balansni minusga tushirsa — qaytarib rad etamiz
    const afterBalance = await this.coins.balance(user.id);
    if (afterBalance < 0) {
      await this.coins.add(user.id, item.price, `Buyurtma bekor (balans yetmadi): ${item.name}`);
      throw new BadRequestException('Coin yetarli emas');
    }
    await this.shop.createOrder(itemId, user.id);
    await this.notify.toAdmin(
      `🛒 Yangi buyurtma: ${user.name} — ${item.name} (${item.price} coin)`,
    );
    return { ok: true, balance: afterBalance };
  }

  // ── Ota-ona ─────────────────────────────────────────────────────────────────
  @Get('parent')
  async parent(@TgUser() tgUser: User | null) {
    if (!tgUser || tgUser.role !== 'parent') throw new ForbiddenException('Faqat ota-ona uchun');
    const children = await this.users.childrenOfParent(tgUser.id);
    const schedule = await this.lessons.getSchedule();
    const result = [];
    for (const child of children) {
      const [pay, attendance, coins] = await Promise.all([
        this.payments.status(child.id),
        this.lessons.attendanceForStudent(child.id),
        this.coins.balance(child.id),
      ]);
      result.push({
        name: child.name,
        coins,
        pay,
        attendance: attendance.map((a) => ({ lessonDate: a.lessonDate, status: a.status })),
      });
    }
    return {
      children: result,
      schedule: schedule.map((s) => ({ dayOfWeek: s.dayOfWeek, lessonTime: s.lessonTime })),
    };
  }
}
