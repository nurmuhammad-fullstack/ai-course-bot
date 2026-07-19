import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/app' });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 AI kurs boti ishga tushdi (health port: ${port})`);
}

bootstrap().catch((err) => {
  console.error('Ishga tushirishda xato:', err);
  process.exit(1);
});
