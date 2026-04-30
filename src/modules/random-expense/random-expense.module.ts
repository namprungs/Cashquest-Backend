import { Module } from '@nestjs/common';
import { RandomExpenseService } from './services/random-expense.service';
import { RandomExpenseController } from './controllers/random-expense.controller';
import { RandomExpenseScheduler } from './tasks/random-expense.scheduler';

@Module({
  controllers: [RandomExpenseController],
  providers: [RandomExpenseService, RandomExpenseScheduler],
  exports: [RandomExpenseService],
})
export class RandomExpenseModule {}
