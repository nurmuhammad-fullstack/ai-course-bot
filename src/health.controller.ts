import { Controller, Get } from '@nestjs/common';

/** Render keep-alive ping uchun */
@Controller()
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', bot: 'ai-course-bot', time: new Date().toISOString() };
  }
}
