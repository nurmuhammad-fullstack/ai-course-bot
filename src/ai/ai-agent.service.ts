import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api } from 'grammy';
import { GeminiService } from './gemini.service';
import { GroupsRepo } from '../repos/groups.repo';
import { UsersRepo } from '../repos/users.repo';
import { fmtMoney } from '../bot/format';

@Injectable()
export class AiAgentService {
  private readonly botToken: string;

  constructor(
    private readonly gemini: GeminiService,
    private readonly groups: GroupsRepo,
    private readonly users: UsersRepo,
    config: ConfigService,
  ) {
    this.botToken = config.getOrThrow<string>('BOT_TOKEN');
  }

  /** Teacher matnli xabarini AI orqali qayta ishlaydi va unga qaytariladigan javob matnini beradi */
  async handleText(api: Api, text: string): Promise<string> {
    const students = await this.users.listByRole('student');
    const result = await this.gemini.askText(text, students);
    return this.execute(api, result);
  }

  /** filePath — Telegram getFile() natijasidagi file_path (masalan "voice/file_1.oga") */
  async handleVoice(api: Api, filePath: string): Promise<string> {
    const res = await fetch(`https://api.telegram.org/file/bot${this.botToken}/${filePath}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const audioBase64 = buffer.toString('base64');

    const students = await this.users.listByRole('student');
    const result = await this.gemini.askVoice(audioBase64, 'audio/ogg', students);
    return this.execute(api, result);
  }

  private async execute(api: Api, result: Awaited<ReturnType<GeminiService['askText']>>): Promise<string> {
    if (result.tool === 'post_to_group') {
      const groups = await this.groups.list();
      if (groups.length === 0) {
        return "⚠️ Hech qanday guruh topilmadi. Meni avval kerakli guruhga admin qilib qo'shing.";
      }
      for (const g of groups) {
        await api.sendMessage(g.chatId, result.args.message).catch(() => undefined);
      }
      return `✅ ${groups.length} ta guruhga post qilindi.`;
    }

    if (result.tool === 'add_payment') {
      const student = await this.users.findStudentByName(result.args.studentName);
      if (!student) return `❌ "${result.args.studentName}" ismli o'quvchi topilmadi.`;
      const newBalance = await this.users.adjustBalance(student.id, result.args.amount);
      return `✅ ${student.name} uchun ${fmtMoney(result.args.amount)} qayd etildi.\n💰 Joriy balans: ${fmtMoney(newBalance)}`;
    }

    if (result.tool === 'get_balance') {
      const student = await this.users.findStudentByName(result.args.studentName);
      if (!student) return `❌ "${result.args.studentName}" ismli o'quvchi topilmadi.`;
      return `💰 ${student.name} balansi: ${fmtMoney(student.balance)}`;
    }

    return result.args.message || 'Tushunmadim.';
  }
}
