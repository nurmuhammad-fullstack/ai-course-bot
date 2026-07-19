import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InlineKeyboard } from 'grammy';
import {
  LESSON_END_PROMPT_MINUTES,
  MORNING_HOUR,
  PRE_LESSON_MINUTES,
  TZ_OFFSET_HOURS,
} from '../config';
import { addMinutes, DAY_NAMES, nowHM, parseTime, todayDayOfWeek } from '../bot/format';
import { LessonsRepo } from '../repos/lessons.repo';
import { SettingsRepo } from '../repos/settings.repo';
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
  ) {}

  /**
   * Ertalabki 11:00 (Toshkent) — dars kunlari avval ADMINDAN vaqtni tasdiqlash so'raladi.
   * Admin tasdiqlagach (daytime:ok yoki yangi vaqt kiritib) o'quvchilarga push ketadi.
   */
  @Cron(`0 ${MORNING_UTC_HOUR} * * *`, { utcOffset: 0 })
  async morningReminder() {
    const sched = await this.lessons.scheduleForDay(todayDayOfWeek());
    if (!sched) return;

    await this.botService.api
      .sendMessage(
        this.botService.adminId,
        `☀️ Bugun (${DAY_NAMES[sched.dayOfWeek]}) dars kuni!\n\n🕐 Dars soat nechada bo'ladi? Joriy jadval: ${sched.lessonTime}\n\nTasdiqlasangiz, o'quvchilarga «Bugun darsimiz bor» xabari ketadi:`,
        {
          reply_markup: new InlineKeyboard()
            .text(`✅ ${sched.lessonTime} — tasdiqlash`, 'daytime:ok')
            .row()
            .text('🕐 Boshqa vaqt kiritish', 'daytime:edit'),
        },
      )
      .catch(() => undefined);
    this.logger.log("Admin'dan dars vaqti tasdig'i so'raldi");
  }

  /** Har daqiqa: darsdan 10 daqiqa oldin eslatma + dars tugagach admin so'rovi */
  @Cron('* * * * *', { utcOffset: 0 })
  async minuteTick() {
    await this.homeworkReminder().catch((e) => this.logger.error(e?.message ?? e));

    const sched = await this.lessons.scheduleForDay(todayDayOfWeek());
    if (!sched) return;

    const t = parseTime(sched.lessonTime);
    if (!t) return;
    const now = nowHM();

    const pre = addMinutes(t, -PRE_LESSON_MINUTES);
    if (pre && now.hour === pre.hour && now.minute === pre.minute) {
      await this.admin.broadcastToStudents(
        this.botService.api,
        `⏰ Diqqat! ${PRE_LESSON_MINUTES} daqiqadan so'ng (${sched.lessonTime} da) dars boshlanadi!`,
      );
      await this.botService.api
        .sendMessage(
          this.botService.adminId,
          `⏰ ${sched.lessonTime} da dars boshlanadi — ${PRE_LESSON_MINUTES} daqiqa qoldi.`,
        )
        .catch(() => undefined);
      this.logger.log('10 daqiqalik eslatma yuborildi');
    }

    const end = addMinutes(t, LESSON_END_PROMPT_MINUTES);
    if (end && now.hour === end.hour && now.minute === end.minute) {
      await this.botService.api
        .sendMessage(
          this.botService.adminId,
          '📚 Dars tugagan bo‘lsa kerak. Davomat va to‘lovni belgilaymizmi?',
          {
            reply_markup: new InlineKeyboard().text('✅ Darsni yakunlash', 'lessonend:start'),
          },
        )
        .catch(() => undefined);
      this.logger.log("Admin'ga dars yakuni so'rovi yuborildi");
    }
  }

  /** Uyga vazifa 1 soat ichida yuborilmasa — adminni eslatadi (yuborilguncha har soatda) */
  private async homeworkReminder() {
    const raw = await this.settings.get('homework_pending');
    if (!raw) return;
    let pending: { lessonId: number; lessonNumber: number; askedAt: number; lastRemind: number };
    try {
      pending = JSON.parse(raw);
    } catch {
      await this.settings.set('homework_pending', '');
      return;
    }

    const HOUR = 60 * 60 * 1000;
    const now = Date.now();
    if (now - pending.askedAt < HOUR) return;
    if (pending.lastRemind && now - pending.lastRemind < HOUR) return;

    // Admin yozganda to'g'ridan-to'g'ri vazifa sifatida qabul qilinsin
    this.state.set(this.botService.adminId, {
      step: 'homework_text',
      lessonId: pending.lessonId,
      lessonNumber: pending.lessonNumber,
    });
    await this.botService.api
      .sendMessage(
        this.botService.adminId,
        `⏰ Eslatma: ${pending.lessonNumber}-dars uchun uyga vazifani hali guruhga yubormadingiz!\n\n📝 Vazifa matnini yozib yuboring — guruhga chiroyli formatda tashlayman.\n(Kerak bo'lmasa «❌ Bekor qilish» deb yozing)`,
      )
      .catch(() => undefined);
    await this.settings.set(
      'homework_pending',
      JSON.stringify({ ...pending, lastRemind: now }),
    );
    this.logger.log("Uyga vazifa eslatmasi yuborildi");
  }
}
