import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, Bot, Context } from 'grammy';
import { LessonsRepo } from '../repos/lessons.repo';
import { SettingsRepo } from '../repos/settings.repo';
import { UsersRepo } from '../repos/users.repo';
import { RegistrationHandler } from './handlers/registration.handler';
import { AdminHandler } from './handlers/admin.handler';
import { StudentHandler } from './handlers/student.handler';
import { ParentHandler } from './handlers/parent.handler';

const ADMIN_CALLBACKS = /^(reg|att|lessonend|sched|taskadm|sub|shopadm|order|daytime|hw):/;
const STUDENT_CALLBACKS = /^(task|quiz|shop):/;

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot!: Bot;
  private readonly adminChatId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersRepo,
    private readonly lessons: LessonsRepo,
    private readonly settings: SettingsRepo,
    private readonly registration: RegistrationHandler,
    private readonly admin: AdminHandler,
    private readonly student: StudentHandler,
    private readonly parent: ParentHandler,
  ) {
    this.adminChatId = config.getOrThrow<string>('ADMIN_CHAT_ID');
  }

  get api(): Api {
    return this.bot.api;
  }

  get adminId(): string {
    return this.adminChatId;
  }

  async onModuleInit() {
    await this.lessons.seedSchedule();

    this.bot = new Bot(this.config.getOrThrow<string>('BOT_TOKEN'));

    this.bot.on('callback_query:data', (ctx) => this.routeCallback(ctx));
    this.bot.on('message', (ctx) => this.routeMessage(ctx));
    this.bot.catch((err) => this.logger.error(`Bot xatosi: ${err.message}`, err.stack));

    this.startPolling();
  }

  /** 409 (boshqa instansiya) va tarmoq xatolarida qulamasdan qayta urinadi */
  private startPolling(attempt = 0) {
    this.bot
      .start({ onStart: (me) => this.logger.log(`🤖 @${me.username} ishga tushdi`) })
      .catch((err) => {
        const delay = Math.min(60_000, 5_000 * (attempt + 1));
        this.logger.error(
          `Polling to'xtadi (${err?.message ?? err}). ${delay / 1000}s dan keyin qayta urinaman...`,
        );
        setTimeout(() => this.startPolling(attempt + 1), delay);
      });
  }

  async onModuleDestroy() {
    await this.bot?.stop();
  }

  private isAdmin(ctx: Context): boolean {
    return String(ctx.from?.id) === this.adminChatId;
  }

  private async routeMessage(ctx: Context) {
    try {
      // Guruh: admin «/guruh» yozsa — e'lonlar guruhi sifatida saqlaymiz
      if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
        const text = ctx.message?.text ?? '';
        if (this.isAdmin(ctx) && /^\/guruh(@\w+)?$/.test(text.trim())) {
          await this.settings.set('group_chat_id', String(ctx.chat.id));
          await ctx.reply(
            `✅ Bu guruh («${ctx.chat.title ?? ''}») e'lonlar guruhi sifatida saqlandi.\nUyga vazifalar shu yerga yuboriladi.`,
          );
        }
        return;
      }
      if (ctx.chat?.type !== 'private') return;

      if (this.isAdmin(ctx)) {
        await this.admin.handleMessage(ctx);
        return;
      }

      const user = await this.users.byTelegramId(String(ctx.chat.id));
      if (!user || user.role === 'pending') {
        await this.registration.handleMessage(ctx);
        return;
      }
      if (user.role === 'student') {
        await this.student.handleMessage(ctx, user);
        return;
      }
      if (user.role === 'parent') {
        await this.parent.handleMessage(ctx, user);
        return;
      }
    } catch (err) {
      this.logger.error('routeMessage xatosi', err as Error);
    }
  }

  private async routeCallback(ctx: Context) {
    try {
      const data = ctx.callbackQuery!.data!;

      if (ADMIN_CALLBACKS.test(data)) {
        if (!this.isAdmin(ctx)) {
          await ctx.answerCallbackQuery({ text: 'Bu amal faqat admin uchun' });
          return;
        }
        if (data.startsWith('reg:')) {
          await this.registration.handleCallback(ctx, data);
        } else {
          await this.admin.handleCallback(ctx, data);
        }
        return;
      }

      if (STUDENT_CALLBACKS.test(data)) {
        const user = await this.users.byTelegramId(String(ctx.from!.id));
        if (!user || user.role !== 'student') {
          await ctx.answerCallbackQuery({ text: "Bu amal faqat o'quvchilar uchun" });
          return;
        }
        await this.student.handleCallback(ctx, data, user);
        return;
      }

      await ctx.answerCallbackQuery();
    } catch (err) {
      this.logger.error('routeCallback xatosi', err as Error);
      await ctx.answerCallbackQuery({ text: 'Xatolik yuz berdi' }).catch(() => undefined);
    }
  }
}
