import { Module } from '@nestjs/common';
import { InvestmentController } from './controllers/investment.controller';
import { InvestmentService } from './services/investment.service';
import { InvestmentCoreService } from './services/investment/investment-core.service';
import { InvestmentEventsService } from './services/investment/investment-events.service';
import { InvestmentManagementService } from './services/investment/investment-management.service';
import { InvestmentMarketService } from './services/investment/investment-market.service';
import { InvestmentPortfolioService } from './services/investment/investment-portfolio.service';
import { ProductListingService } from './services/investment/product-listing.service';
import { PriceGenerationService } from './services/investment/price-generation.service';
import { PortfolioQueryService } from './services/investment/portfolio-query.service';
import { OrderExecutionService } from './services/investment/order-execution.service';
import { PayoutService } from './services/investment/payout.service';
import { LivePriceTickScheduler } from './tasks/live-price-tick.scheduler';
import { EventStatusScheduler } from './tasks/event-status.scheduler';
import { AppCacheModule } from '../cache/app-cache.module';
import { RandomExpenseModule } from '../random-expense/random-expense.module';

@Module({
  imports: [AppCacheModule, RandomExpenseModule],
  controllers: [InvestmentController],
  providers: [
    InvestmentCoreService,
    InvestmentEventsService,
    ProductListingService,
    PriceGenerationService,
    InvestmentMarketService,
    InvestmentManagementService,
    PortfolioQueryService,
    OrderExecutionService,
    PayoutService,
    InvestmentPortfolioService,
    InvestmentService,
    LivePriceTickScheduler,
    EventStatusScheduler,
  ],
})
export class InvestmentModule {}
