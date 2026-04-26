import { Module } from '@nestjs/common';
import { RandomExpenseService } from './services/random-expense.service';
import { RandomExpenseController } from './controllers/random-expense.controller';
import { RandomExpenseScheduler } from './tasks/random-expense.scheduler';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [FinanceModule],
  controllers: [RandomExpenseController],
  providers: [RandomExpenseService, RandomExpenseScheduler],
  exports: [RandomExpenseService],
})
export class RandomExpenseModule {}
