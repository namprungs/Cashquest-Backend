import { Module } from '@nestjs/common';
import { QuestController } from './quest.controller';
import { QuestService } from './quest.service';
import { AppCacheModule } from '../cache/app-cache.module';
import { RandomExpenseModule } from '../random-expense/random-expense.module';

@Module({
  imports: [AppCacheModule, RandomExpenseModule],
  controllers: [QuestController],
  providers: [QuestService],
  exports: [QuestService],
})
export class QuestModule {}
