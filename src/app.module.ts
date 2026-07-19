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
import { SettingsRepo } from './repos/settings.repo';
import { StateStore } from './bot/state';
import { RegistrationHandler } from './bot/handlers/registration.handler';
import { AdminHandler } from './bot/handlers/admin.handler';
import { StudentHandler } from './bot/handlers/student.handler';
import { ParentHandler } from './bot/handlers/parent.handler';
import { BotService } from './bot/bot.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { NotifyService } from './services/notify.service';
import { LessonFlowService } from './services/lesson-flow.service';
import { TgAuthGuard, AdminGuard } from './webapp/auth.guard';
import { AdminController } from './webapp/admin.controller';
import { UserController } from './webapp/user.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DbModule,
  ],
  controllers: [HealthController, AdminController, UserController],
  providers: [
    UsersRepo,
    PaymentsRepo,
    CoinsRepo,
    LessonsRepo,
    TasksRepo,
    ShopRepo,
    SettingsRepo,
    StateStore,
    RegistrationHandler,
    AdminHandler,
    StudentHandler,
    ParentHandler,
    BotService,
    SchedulerService,
    NotifyService,
    LessonFlowService,
    TgAuthGuard,
    AdminGuard,
  ],
})
export class AppModule {}
