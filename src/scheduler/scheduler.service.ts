import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InlineKeyboard } from 'grammy';
import {
  LESSON_END_PROMPT_MINUTES,
  MORNING_HOUR,
  PRE_LESSON_MINUTES,
  TZ_OFFSET_HOURS,
} from '../config';
import {
  addMinutes,
  DAY_NAMES,
  fmtMoney,
  nowHM,
  parseTime,
  todayDate,
  todayDayOfWeek,
} from '../bot/format';
import { LessonsRepo } from '../repos/lessons.repo';
import { PaymentsRepo } from '../repos/payments.repo';
import { UsersRepo } from '../repos/users.repo';
import { SettingsRepo } from '../repos/settings.repo';
import { CourseGroupsRepo } from '../repos/course-groups.repo';
import { StateStore } from '../bot/state';
import { AdminHandler } from '../bot/handlers/admin.handler';
import { BotService } from '../bot/bot.service';

const MORNING_UTC_HOUR = MORNING_HOUR - TZ_OFFSET_HOURS; // 11:00 Toshkent = 06:00 UTC

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly lessons: LessonsRepo,
    private readonly admin: AdminHandler,
    private readonly botService: BotService,
    private readonly settings: SettingsRepo,
    private readonly state: StateStore,
    private readonly payments: PaymentsRepo,
    private readonly users: UsersRepo,
    private readonly courseGroups: CourseGroupsRepo,
  ) {}

  /** Berilgan sanadan N kun keyingi kun-raqamini beradi (oy oxiridan oshib ketmaydi) */
  private dayOfDate(iso: string, offsetDays: number): number {
    const dt = new Date(iso + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() + offsetDays);
    return dt.getUTCDate();
  }

  /** Har kuni 10:00 (Toshkent): to'lov kuni eslatmalari — 3 kun oldin va o'sha kuni (har oy takrorlanadi) */
  @Cron(`0 ${10 - TZ_OFFSET_HOURS} * * *`, { utcOffset: 0 })
  async paymentReminders() {
    const today = todayDate();
    const todayDayNum = this.dayOfDate(today, 0);
    const in3DaysNum = this.dayOfDate(today, 3);
    const rows = await this.payments.withDueDays();
    for (const p of rows) {
      const isDueToday = p.dueDay === todayDayNum;
      const isThreeDaysBefore = p.dueDay === in3DaysNum;
      if (!isDueToday && !isThreeDaysBefore) continue;

      const student = await this.users.byId(p.studentId);
      if (!student) continue;
      const pay = await this.payments.status(p.studentId);
      const when = isDueToday ? 'BUGUN' : `3 kundan keyin (har oyning ${p.dueDay}-kuni)`;
      const text =
        `💳 To'lov eslatmasi!\n\n` +
        `${student.name} uchun to'lov kuni ${when}.\n\n` +
        `📊 Holat: ${pay.chargedCount} ta dars o'tildi, hisobingizda ${fmtMoney(pay.remaining)} qoldi (${pay.lessonsLeft} ta dars).`;

      const parents = await this.users.parentsOfStudent(p.studentId);
      for (const parent of parents) {
        await this.botService.api.sendMessage(parent.telegramId, text).catch(() => undefined);
      }
      await this.botService.api
        .sendMessage(
          this.botService.adminId,
          `🔔 ${student.name} ota-onasiga to'lov eslatmasi yuborildi (${isDueToday ? 'bugun to‘lov kuni' : "3 kun qoldi"}).${parents.length ? '' : "\n⚠️ Bu o'quvchiga ota-ona biriktirilmagan — eslatma hech kimga bormadi!"}`,
        )
        .catch(() => undefined);
    }
  }

  /**
   * Ertalabki 11:00 (Toshkent) — har faol guruh uchun alohida: dars kuni bo'lsa
   * avval ADMINDAN vaqtni tasdiqlash so'raladi (guruh nomi bilan).
   */
  @Cron(`0 ${MORNING_UTC_HOUR} * * *`, { utcOffset: 0 })
  async morningReminder() {
    const groups = await this.courseGroups.list();
    const dayOfWeek = todayDayOfWeek();
    for (const group of groups) {
      const sched = await this.lessons.scheduleForDay(group.id, dayOfWeek);
      if (!sched) continue;

      await this.botService.api
        .sendMessage(
          this.botService.adminId,
          `☀️ «${group.name}»: bugun (${DAY_NAMES[sched.dayOfWeek]}) dars kuni!\n\n🕐 Dars soat nechada bo'ladi? Joriy jadval: ${sched.lessonTime}\n\nTasdiqlasangiz, o'quvchilarga «Bugun darsimiz bor» xabari ketadi:`,
          {
            reply_markup: new InlineKeyboard()
              .text(`✅ ${sched.lessonTime} — tasdiqlash`, `daytime:ok:${group.id}`)
              .row()
              .text('🕐 Boshqa vaqt kiritish', `daytime:edit:${group.id}`),
          },
        )
        .catch(() => undefined);
      this.logger.log(`«${group.name}» uchun admin'dan dars vaqti tasdig'i so'raldi`);
    }
  }

  /** Har daqiqa: har faol guruh uchun darsdan 10 daqiqa oldin eslatma + dars tugagach admin so'rovi */
  @Cron('* * * * *', { utcOffset: 0 })
  async minuteTick() {
    await this.homeworkReminder().catch((e) => this.logger.error(e?.message ?? e));

    const groups = await this.courseGroups.list();
    const dayOfWeek = todayDayOfWeek();
    const now = nowHM();

    for (const group of groups) {
      const sched = await this.lessons.scheduleForDay(group.id, dayOfWeek);
      if (!sched) continue;

      const t = parseTime(sched.lessonTime);
      if (!t) continue;

      const pre = addMinutes(t, -PRE_LESSON_MINUTES);
      if (pre && now.hour === pre.hour && now.minute === pre.minute) {
        await this.admin.broadcastToStudents(
          this.botService.api,
          group.id,
          `⏰ Diqqat! ${PRE_LESSON_MINUTES} daqiqadan so'ng (${sched.lessonTime} da) dars boshlanadi!`,
        );
        await this.botService.api
          .sendMessage(
            this.botService.adminId,
            `⏰ «${group.name}»: ${sched.lessonTime} da dars boshlanadi — ${PRE_LESSON_MINUTES} daqiqa qoldi.`,
          )
          .catch(() => undefined);
        this.logger.log(`«${group.name}»: 10 daqiqalik eslatma yuborildi`);
      }

      const end = addMinutes(t, LESSON_END_PROMPT_MINUTES);
      if (end && now.hour === end.hour && now.minute === end.minute) {
        await this.botService.api
          .sendMessage(
            this.botService.adminId,
            `📚 «${group.name}»: dars tugagan bo‘lsa kerak. Davomat va to‘lovni belgilaymizmi?`,
            {
              reply_markup: new InlineKeyboard().text('✅ Darsni yakunlash', `lessonend:start:${group.id}`),
            },
          )
          .catch(() => undefined);
        this.logger.log(`«${group.name}»: admin'ga dars yakuni so'rovi yuborildi`);
      }
    }
  }

  /** Uyga vazifa 1 soat ichida yuborilmasa — adminni eslatadi (har guruh mustaqil, yuborilguncha har soatda) */
  private async homeworkReminder() {
    const groups = await this.courseGroups.list();
    for (const group of groups) {
      const raw = await this.settings.get(`homework_pending:${group.id}`);
      if (!raw) continue;
      let pending: { lessonId: number; lessonNumber: number; groupId: number; askedAt: number; lastRemind: number };
      try {
        pending = JSON.parse(raw);
      } catch {
        await this.settings.set(`homework_pending:${group.id}`, '');
        continue;
      }

      const HOUR = 60 * 60 * 1000;
      const now = Date.now();
      if (now - pending.askedAt < HOUR) continue;
      if (pending.lastRemind && now - pending.lastRemind < HOUR) continue;

      // Admin yozganda to'g'ridan-to'g'ri vazifa sifatida qabul qilinsin
      this.state.set(this.botService.adminId, {
        step: 'homework_text',
        lessonId: pending.lessonId,
        lessonNumber: pending.lessonNumber,
        groupId: group.id,
      });
      await this.botService.api
        .sendMessage(
          this.botService.adminId,
          `⏰ Eslatma: «${group.name}» — ${pending.lessonNumber}-dars uchun uyga vazifani hali yubormadingiz!\n\n📝 Vazifa matnini yozib yuboring — guruhga chiroyli formatda tashlayman.\n(Kerak bo'lmasa «❌ Bekor qilish» deb yozing)`,
        )
        .catch(() => undefined);
      await this.settings.set(
        `homework_pending:${group.id}`,
        JSON.stringify({ ...pending, lastRemind: now }),
      );
      this.logger.log(`«${group.name}»: uyga vazifa eslatmasi yuborildi`);
    }
  }
}
