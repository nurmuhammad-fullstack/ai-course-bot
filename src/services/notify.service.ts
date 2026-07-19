import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api } from 'grammy';
import { UsersRepo } from '../repos/users.repo';

/** Botning polling qismidan mustaqil xabar yuborish (mini app API uchun ham) */
@Injectable()
export class NotifyService {
  readonly api: Api;
  readonly adminChatId: string;

  constructor(
    private readonly users: UsersRepo,
    config: ConfigService,
  ) {
    this.api = new Api(config.getOrThrow<string>('BOT_TOKEN'));
    this.adminChatId = config.getOrThrow<string>('ADMIN_CHAT_ID');
  }

  async send(telegramId: string, text: string) {
    await this.api.sendMessage(telegramId, text).catch(() => undefined);
  }

  async toAdmin(text: string) {
    await this.send(this.adminChatId, text);
  }

  async broadcastToStudents(text: string) {
    const students = await this.users.listByRole('student');
    for (const s of students) await this.send(s.telegramId, text);
  }

  async notifyParents(studentId: number, text: string) {
    const parents = await this.users.parentsOfStudent(studentId);
    for (const p of parents) await this.send(p.telegramId, text);
  }
}
