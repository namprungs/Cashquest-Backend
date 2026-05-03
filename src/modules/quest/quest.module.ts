import { Module } from '@nestjs/common';
import { QuestController } from './quest.controller';
import { QuestService } from './quest.service';
import { AppCacheModule } from '../cache/app-cache.module';
import { RandomExpenseModule } from '../random-expense/random-expense.module';
import { QuestValidationService } from './services/quest-validation.service';
import { QuestQueryService } from './services/quest-query.service';
import { QuizManagementService } from './services/quiz-management.service';
import { QuestSubmissionService } from './services/quest-submission.service';
import { InteractiveQuestService } from './services/interactive-quest.service';

@Module({
  imports: [AppCacheModule, RandomExpenseModule],
  controllers: [QuestController],
  providers: [
    QuestService,
    QuestValidationService,
    QuestQueryService,
    QuizManagementService,
    QuestSubmissionService,
    InteractiveQuestService,
  ],
  exports: [QuestService],
})
export class QuestModule {}
