import { Module } from '@nestjs/common';
import { InvestmentController } from './controllers/investment.controller';
import { InvestmentService } from './services/investment.service';
import { InvestmentCoreService } from './services/investment/investment-core.service';
import { InvestmentEventsService } from './services/investment/investment-events.service';
import { InvestmentManagementService } from './services/investment/investment-management.service';
import { InvestmentMarketService } from './services/investment/investment-market.service';
import { InvestmentPortfolioService } from './services/investment/investment-portfolio.service';
import { LivePriceTickScheduler } from './tasks/live-price-tick.scheduler';
import { EventStatusScheduler } from './tasks/event-status.scheduler';

@Module({
  controllers: [InvestmentController],
  providers: [
    InvestmentCoreService,
    InvestmentEventsService,
    InvestmentMarketService,
    InvestmentManagementService,
    InvestmentPortfolioService,
    InvestmentService,
    LivePriceTickScheduler,
    EventStatusScheduler,
  ],
})
export class InvestmentModule {}
