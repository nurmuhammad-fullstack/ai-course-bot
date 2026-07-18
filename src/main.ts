import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 AI kurs boti ishga tushdi (health port: ${port})`);
}

bootstrap().catch((err) => {
  console.error('Ishga tushirishda xato:', err);
  process.exit(1);
});
