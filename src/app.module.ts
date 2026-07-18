import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DbModule } from './db/db.module';
import { UsersRepo } from './repos/users.repo';
import { PaymentsRepo } from './repos/payments.repo';
import { CoinsRepo } from './repos/coins.repo';
import { LessonsRepo } from './repos/lessons.repo';
import { TasksRepo } from './repos/tasks.repo';
import { ShopRepo } from './repos/shop.repo';
import { StateStore } from './bot/state';
import { RegistrationHandler } from './bot/handlers/registration.handler';
import { AdminHandler } from './bot/handlers/admin.handler';
import { StudentHandler } from './bot/handlers/student.handler';
import { ParentHandler } from './bot/handlers/parent.handler';
import { BotService } from './bot/bot.service';
import { SchedulerService } from './scheduler/scheduler.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DbModule,
  ],
  controllers: [HealthController],
  providers: [
    UsersRepo,
    PaymentsRepo,
    CoinsRepo,
    LessonsRepo,
    TasksRepo,
    ShopRepo,
    StateStore,
    RegistrationHandler,
    AdminHandler,
    StudentHandler,
    ParentHandler,
    BotService,
    SchedulerService,
  ],
})
export class AppModule {}
