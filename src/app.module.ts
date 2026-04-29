import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthService } from './health.service';
import { AcademicModule } from './modules/academic/academic.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassroomModule } from './modules/classroom/classroom.module';
import { RoleModule } from './modules/role/role.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { QuestModule } from './modules/quest/quest.module';
import { LearningModuleModule } from './modules/learning-module/learning-module.module';
import { InvestmentModule } from './modules/investment/investment.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { RandomExpenseModule } from './modules/random-expense/random-expense.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PlayerModule } from './modules/player/player.module';
import { UploadModule } from './modules/upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UserModule,
    AuthModule,
    AcademicModule,
    ClassroomModule,
    RoleModule,
    QuizModule,
    QuestModule,
    LearningModuleModule,
    FinanceModule,
    PlayerModule,
    InvestmentModule,
    GamificationModule,
    RandomExpenseModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [AppService, HealthService],
})
export class AppModule {}
