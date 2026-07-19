import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersRepo, User } from '../repos/users.repo';
import { validateInitData } from './initdata.util';

export interface AuthedRequest {
  tgUser?: User | null;
  tgUserId?: string;
  isAdmin?: boolean;
}

/** X-Init-Data headerdagi Telegram imzosini tekshiradi, userni request'ga qo'shadi */
@Injectable()
export class TgAuthGuard implements CanActivate {
  private readonly botToken: string;
  private readonly adminChatId: string;

  constructor(
    private readonly users: UsersRepo,
    config: ConfigService,
  ) {
    this.botToken = config.getOrThrow<string>('BOT_TOKEN');
    this.adminChatId = config.getOrThrow<string>('ADMIN_CHAT_ID');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const initData = req.headers['x-init-data'] as string | undefined;
    if (!initData) throw new UnauthorizedException('initData yo‘q');

    const parsed = validateInitData(initData, this.botToken);
    if (!parsed) throw new UnauthorizedException('initData imzosi noto‘g‘ri');

    req.tgUserId = parsed.userId;
    req.isAdmin = parsed.userId === this.adminChatId;
    req.tgUser = (await this.users.byTelegramId(parsed.userId)) ?? null;
    return true;
  }
}

/** Faqat admin uchun */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.isAdmin) throw new UnauthorizedException('Faqat admin');
    return true;
  }
}

export const TgUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User | null => {
  return ctx.switchToHttp().getRequest().tgUser ?? null;
});

export const TgUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().tgUserId;
});
