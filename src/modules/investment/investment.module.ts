import { Module } from '@nestjs/common';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './investment.service';
import { LivePriceTickScheduler } from './tasks/live-price-tick.scheduler';

@Module({
  controllers: [InvestmentController],
  providers: [InvestmentService, LivePriceTickScheduler],
})
export class InvestmentModule {}
