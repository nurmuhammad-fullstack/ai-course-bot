import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module';

/** Oddiy in-memory rate limiter: har bir kalit (user/IP) uchun daqiqasiga 120 ta so'rov */
function rateLimiter() {
  const WINDOW_MS = 60_000;
  const LIMIT = 120;
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }, WINDOW_MS).unref();

  return (req: any, res: any, next: () => void) => {
    if (!req.path.startsWith('/api')) return next();
    const initData = String(req.headers['x-init-data'] ?? '');
    const key = initData
      ? 'u:' + initData.slice(0, 64)
      : 'ip:' + (req.ip ?? req.socket?.remoteAddress ?? '?');
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > LIMIT) {
      res.status(429).json({ statusCode: 429, message: "So'rovlar juda ko'p. Birozdan keyin urinib ko'ring." });
      return;
    }
    next();
  };
}

function securityHeaders() {
  return (_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.set('trust proxy', 1); // Render proxy ortida to'g'ri IP olish uchun
  app.use(json({ limit: '64kb' }));
  app.use(securityHeaders());
  app.use(rateLimiter());
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/app' });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 AI kurs boti ishga tushdi (health port: ${port})`);
}

bootstrap().catch((err) => {
  console.error('Ishga tushirishda xato:', err);
  process.exit(1);
});
