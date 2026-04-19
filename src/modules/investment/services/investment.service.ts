import { Injectable } from '@nestjs/common';
import { ListProductPricesQueryDto } from '../dto/list-product-prices-query.dto';
import { CreateOrderDto } from '../dto/create-order.dto';
import { ListMyOrdersQueryDto } from '../dto/list-my-orders-query.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { UpsertProductSimulationsDto } from '../dto/upsert-product-simulations.dto';
import { UpsertTermSimulationDto } from '../dto/upsert-term-simulation.dto';
import { GenerateWeekPriceDto } from '../dto/generate-week-price.dto';
import { GenerateRangePriceDto } from '../dto/generate-range-price.dto';
import { ManualProductPricesDto } from '../dto/manual-product-prices.dto';
import { CreateEconomicEventDto } from '../dto/create-economic-event.dto';
import { UpdateEconomicEventDto } from '../dto/update-economic-event.dto';
import { CreateTermEventDto } from '../dto/create-term-event.dto';
import { UpdateTermEventDto } from '../dto/update-term-event.dto';
import { CreateMarketRegimeDto } from '../dto/create-market-regime.dto';
import { UpdateMarketRegimeDto } from '../dto/update-market-regime.dto';
import { ProcessOrdersDto } from '../dto/process-orders.dto';
import { ProcessPayoutsDto } from '../dto/process-payouts.dto';
import { ListLivePriceTicksQueryDto } from '../dto/list-live-price-ticks-query.dto';
import { GenerateLiveTicksDto } from '../dto/generate-live-ticks.dto';
import { FinalizeLiveWeekDto } from '../dto/finalize-live-week.dto';
import { InvestmentWalletTransferDto } from '../dto/investment-wallet-transfer.dto';
import { ListTermEventsQueryDto } from '../dto/list-term-events-query.dto';
import { CurrentUser } from './investment/investment-core.service';
import { InvestmentEventsService } from './investment/investment-events.service';
import { InvestmentManagementService } from './investment/investment-management.service';
import { InvestmentMarketService } from './investment/investment-market.service';
import { InvestmentPortfolioService } from './investment/investment-portfolio.service';

@Injectable()
export class InvestmentService {
  constructor(
    private readonly marketService: InvestmentMarketService,
    private readonly eventsService: InvestmentEventsService,
    private readonly managementService: InvestmentManagementService,
    private readonly portfolioService: InvestmentPortfolioService,
  ) {}

  listProducts(termId: string) {
    return this.marketService.listProducts(termId);
  }

  getProductDetail(termId: string, productId: string) {
    return this.marketService.getProductDetail(termId, productId);
  }

  listProductPrices(
    termId: string,
    productId: string,
    query: ListProductPricesQueryDto,
  ) {
    return this.marketService.listProductPrices(termId, productId, query);
  }

  listLivePriceTicks(
    termId: string,
    productId: string,
    query: ListLivePriceTicksQueryDto,
  ) {
    return this.marketService.listLivePriceTicks(termId, productId, query);
  }

  generateLiveTicks(termId: string, dto: GenerateLiveTicksDto) {
    return this.marketService.generateLiveTicks(termId, dto);
  }

  finalizeLiveWeek(termId: string, dto: FinalizeLiveWeekDto) {
    return this.marketService.finalizeLiveWeek(termId, dto);
  }

  getMyPortfolio(termId: string, user: CurrentUser) {
    return this.portfolioService.getMyPortfolio(termId, user);
  }

  openInvestmentWallet(termId: string, user: CurrentUser) {
    return this.portfolioService.openInvestmentWallet(termId, user);
  }

  depositToInvestment(
    termId: string,
    user: CurrentUser,
    dto: InvestmentWalletTransferDto,
  ) {
    return this.portfolioService.depositToInvestment(termId, user, dto.amount);
  }

  withdrawFromInvestment(
    termId: string,
    user: CurrentUser,
    dto: InvestmentWalletTransferDto,
  ) {
    return this.portfolioService.withdrawFromInvestment(
      termId,
      user,
      dto.amount,
    );
  }

  getMyHoldings(termId: string, user: CurrentUser) {
    return this.portfolioService.getMyHoldings(termId, user);
  }

  createOrder(termId: string, user: CurrentUser, dto: CreateOrderDto) {
    return this.portfolioService.createOrder(termId, user, dto);
  }

  listMyOrders(termId: string, user: CurrentUser, query: ListMyOrdersQueryDto) {
    return this.portfolioService.listMyOrders(termId, user, query);
  }

  cancelOrder(termId: string, orderId: string, user: CurrentUser) {
    return this.portfolioService.cancelOrder(termId, orderId, user);
  }

  listMyDividends(termId: string, user: CurrentUser) {
    return this.portfolioService.listMyDividends(termId, user);
  }

  listMyBonds(termId: string, user: CurrentUser) {
    return this.portfolioService.listMyBonds(termId, user);
  }

  listActiveEvents(termId: string, weekNo?: string) {
    return this.eventsService.listActiveEvents(termId, weekNo);
  }

  listTermEvents(termId: string, query: ListTermEventsQueryDto) {
    return this.eventsService.listTermEvents(termId, query);
  }

  createProduct(termId: string, dto: CreateProductDto) {
    return this.managementService.createProduct(termId, dto);
  }

  updateProduct(productId: string, dto: UpdateProductDto) {
    return this.managementService.updateProduct(productId, dto);
  }

  setProductActive(productId: string, isActive: boolean) {
    return this.managementService.setProductActive(productId, isActive);
  }

  upsertProductSimulations(termId: string, dto: UpsertProductSimulationsDto) {
    return this.managementService.upsertProductSimulations(termId, dto);
  }

  upsertTermSimulation(termId: string, dto: UpsertTermSimulationDto) {
    return this.managementService.upsertTermSimulation(termId, dto);
  }

  generateWeekPrices(termId: string, dto: GenerateWeekPriceDto) {
    return this.marketService.generateWeekPrices(termId, dto);
  }

  generateRangePrices(termId: string, dto: GenerateRangePriceDto) {
    return this.marketService.generateRangePrices(termId, dto);
  }

  manualUpsertPrices(termId: string, dto: ManualProductPricesDto) {
    return this.marketService.manualUpsertPrices(termId, dto);
  }

  createEconomicEvent(dto: CreateEconomicEventDto) {
    return this.managementService.createEconomicEvent(dto);
  }

  updateEconomicEvent(eventId: string, dto: UpdateEconomicEventDto) {
    return this.managementService.updateEconomicEvent(eventId, dto);
  }

  createTermEvent(termId: string, dto: CreateTermEventDto) {
    return this.managementService.createTermEvent(termId, dto);
  }

  updateTermEvent(
    termId: string,
    termEventId: string,
    dto: UpdateTermEventDto,
  ) {
    return this.managementService.updateTermEvent(termId, termEventId, dto);
  }

  createRegime(termId: string, dto: CreateMarketRegimeDto) {
    return this.managementService.createRegime(termId, dto);
  }

  updateRegime(termId: string, regimeId: string, dto: UpdateMarketRegimeDto) {
    return this.managementService.updateRegime(termId, regimeId, dto);
  }

  processPendingOrders(termId: string, dto: ProcessOrdersDto) {
    return this.portfolioService.processPendingOrders(termId, dto);
  }

  processPayouts(termId: string, dto: ProcessPayoutsDto) {
    return this.portfolioService.processPayouts(termId, dto);
  }
}
