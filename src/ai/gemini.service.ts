import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../repos/users.repo';

export type GeminiTool =
  | { tool: 'post_to_group'; args: { message: string } }
  | { tool: 'add_payment'; args: { studentName: string; amount: number } }
  | { tool: 'get_balance'; args: { studentName: string } }
  | { tool: 'plain_reply'; args: { message: string } };

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'post_to_group',
        description:
          "O'quvchilar guruhiga e'lon/xabar post qilish (masalan, dars o'tgani haqida xabar berish)",
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Guruhga yuboriladigan tayyor, chiroyli formatlangan xabar matni',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'add_payment',
        description:
          "O'quvchining oylik to'lov balansiga summa qo'shish yoki ayirish (to'lov qilgan bo'lsa musbat, yangi oy/qarz yozilsa manfiy son)",
        parameters: {
          type: 'object',
          properties: {
            studentName: { type: 'string', description: "O'quvchining ismi" },
            amount: {
              type: 'number',
              description:
                "Summasi (so'mda). To'lov qilgan bo'lsa musbat son, oylik qarz yozilsa yoki hisobdan yechilsa manfiy son.",
            },
          },
          required: ['studentName', 'amount'],
        },
      },
      {
        name: 'get_balance',
        description: "O'quvchining joriy to'lov balansini (qarzi/krediti) so'rash",
        parameters: {
          type: 'object',
          properties: {
            studentName: { type: 'string', description: "O'quvchining ismi" },
          },
          required: ['studentName'],
        },
      },
      {
        name: 'plain_reply',
        description:
          "Hech qaysi amal (guruhga post, to'lov, balans) mos kelmasa, oddiy suhbat javobi berish",
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: "O'qituvchiga qaytariladigan javob matni" },
          },
          required: ['message'],
        },
      },
    ],
  },
];

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly url: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-flash-latest';
    this.url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  async askText(text: string, students: User[]): Promise<GeminiTool> {
    return this.call([{ text }], students);
  }

  async askVoice(audioBase64: string, mimeType: string, students: User[]): Promise<GeminiTool> {
    return this.call(
      [
        {
          text: "O'qituvchining ovozli xabari (audio ilova qilingan). Uni tinglab, niyatini aniqla va mos funksiyani chaqir.",
        },
        { inlineData: { mimeType, data: audioBase64 } },
      ],
      students,
    );
  }

  private buildSystemInstruction(students: User[]) {
    const studentList = students.length
      ? students.map((s) => `- ${s.name}`).join('\n')
      : "(hozircha o'quvchilar ro'yxati bo'sh)";

    return {
      role: 'user',
      parts: [
        {
          text:
            "Sen dars eslatma botining AI yordamchisisan. O'qituvchi bilan o'zbek tilida gaplashasan.\n" +
            "O'qituvchi senga matn yoki ovozli xabar yuboradi. Sen uning niyatini aniqlab, mos funksiyani chaqirishing kerak:\n" +
            "- Agar guruhga biror e'lon/xabar yozishni so'rasa (masalan \"bugun dars o'tdi, guruhga yoz\") — post_to_group.\n" +
            "- Agar o'quvchi to'lov qilgani (balansga qo'shish) yoki yangi oy/qarz yozish haqida gapirsa (masalan \"Ozodbek 100000 to'ladi\") — add_payment.\n" +
            "- Agar o'quvchining balansi/qarzi haqida so'rasa — get_balance.\n" +
            "- Boshqa barcha holatlarda — plain_reply bilan oddiy javob ber.\n\n" +
            'Ro\'yxatdagi o\'quvchilar:\n' +
            studentList +
            '\n\n' +
            "studentName parametrini shu ro'yxatdagi eng mos ismga moslashtir (yozilishi biroz farq qilsa ham).",
        },
      ],
    };
  }

  private async call(parts: unknown[], students: User[]): Promise<GeminiTool> {
    if (!this.apiKey) {
      return {
        tool: 'plain_reply',
        args: { message: "⚠️ Gemini API kaliti sozlanmagan. GEMINI_API_KEY environment o'zgaruvchisini qo'shing." },
      };
    }

    const body = {
      contents: [this.buildSystemInstruction(students), { role: 'user', parts }],
      tools: TOOLS,
      tool_config: { function_calling_config: { mode: 'ANY' } },
    };

    const res = await fetch(`${this.url}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.error(`Gemini API xatosi (${res.status}): ${errText}`);
      return { tool: 'plain_reply', args: { message: '⚠️ AI bilan bog\'lanishda xatolik yuz berdi.' } };
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: unknown } }[] } }[];
    };
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const call = part?.functionCall;

    if (!call) {
      const text = part?.text || "Tushunmadim, qaytadan yozib ko'ring.";
      return { tool: 'plain_reply', args: { message: text } };
    }

    return { tool: call.name, args: call.args ?? {} } as GeminiTool;
  }
}
