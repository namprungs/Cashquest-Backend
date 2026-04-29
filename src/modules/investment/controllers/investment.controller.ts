import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NeededPermissions } from '../../auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { InvestmentService } from '../services/investment.service';
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

@Controller('market')
export class InvestmentController {
  constructor(private readonly investmentService: InvestmentService) {}

  @Get('terms/:termId/products')
  @NeededPermissions([PERMISSIONS.INVESTMENT.MARKET_VIEW])
  listProducts(@Param('termId') termId: string) {
    return this.investmentService.listProducts(termId);
  }

  @Get('terms/:termId/products/:productId')
  @NeededPermissions([PERMISSIONS.INVESTMENT.MARKET_VIEW])
  getProductDetail(
    @Param('termId') termId: string,
    @Param('productId') productId: string,
  ) {
    return this.investmentService.getProductDetail(termId, productId);
  }

  @Get('terms/:termId/products/:productId/prices')
  @NeededPermissions([PERMISSIONS.INVESTMENT.MARKET_VIEW])
  listProductPrices(
    @Param('termId') termId: string,
    @Param('productId') productId: string,
    @Query() query: ListProductPricesQueryDto,
  ) {
    return this.investmentService.listProductPrices(termId, productId, query);
  }

  @Get('terms/:termId/products/:productId/live-prices')
  @NeededPermissions([PERMISSIONS.INVESTMENT.MARKET_VIEW])
  listLivePriceTicks(
    @Param('termId') termId: string,
    @Param('productId') productId: string,
    @Query() query: ListLivePriceTicksQueryDto,
  ) {
    return this.investmentService.listLivePriceTicks(termId, productId, query);
  }

  @Get('terms/:termId/portfolio/me')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PORTFOLIO_VIEW_OWN])
  myPortfolio(@Param('termId') termId: string, @CurrentUser() user: User) {
    return this.investmentService.getMyPortfolio(termId, user);
  }

  @Post('terms/:termId/investment-wallet/open')
  @NeededPermissions([PERMISSIONS.INVESTMENT.WALLET_MANAGE_OWN])
  openInvestmentWallet(
    @Param('termId') termId: string,
    @CurrentUser() user: User,
  ) {
    return this.investmentService.openInvestmentWallet(termId, user);
  }

  @Post('terms/:termId/investment-wallet/deposit')
  @NeededPermissions([PERMISSIONS.INVESTMENT.WALLET_MANAGE_OWN])
  depositToInvestment(
    @Param('termId') termId: string,
    @CurrentUser() user: User,
    @Body() dto: InvestmentWalletTransferDto,
  ) {
    return this.investmentService.depositToInvestment(termId, user, dto);
  }

  @Post('terms/:termId/investment-wallet/withdraw')
  @NeededPermissions([PERMISSIONS.INVESTMENT.WALLET_MANAGE_OWN])
  withdrawFromInvestment(
    @Param('termId') termId: string,
    @CurrentUser() user: User,
    @Body() dto: InvestmentWalletTransferDto,
  ) {
    return this.investmentService.withdrawFromInvestment(termId, user, dto);
  }

  @Get('terms/:termId/holdings/me')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PORTFOLIO_VIEW_OWN])
  myHoldings(@Param('termId') termId: string, @CurrentUser() user: User) {
    return this.investmentService.getMyHoldings(termId, user);
  }

  @Post('terms/:termId/orders')
  @NeededPermissions([PERMISSIONS.INVESTMENT.ORDER_MANAGE_OWN])
  createOrder(
    @Param('termId') termId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateOrderDto,
  ) {
    return this.investmentService.createOrder(termId, user, dto);
  }

  @Get('terms/:termId/orders/me')
  @NeededPermissions([PERMISSIONS.INVESTMENT.ORDER_MANAGE_OWN])
  myOrders(
    @Param('termId') termId: string,
    @CurrentUser() user: User,
    @Query() query: ListMyOrdersQueryDto,
  ) {
    return this.investmentService.listMyOrders(termId, user, query);
  }

  @Patch('terms/:termId/orders/:orderId/cancel')
  @NeededPermissions([PERMISSIONS.INVESTMENT.ORDER_MANAGE_OWN])
  cancelOrder(
    @Param('termId') termId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: User,
  ) {
    return this.investmentService.cancelOrder(termId, orderId, user);
  }

  @Get('terms/:termId/dividends/me')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PORTFOLIO_VIEW_OWN])
  myDividends(@Param('termId') termId: string, @CurrentUser() user: User) {
    return this.investmentService.listMyDividends(termId, user);
  }

  @Get('terms/:termId/bonds/me')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PORTFOLIO_VIEW_OWN])
  myBonds(@Param('termId') termId: string, @CurrentUser() user: User) {
    return this.investmentService.listMyBonds(termId, user);
  }

  @Get('terms/:termId/events/active')
  @NeededPermissions([PERMISSIONS.INVESTMENT.EVENT_VIEW])
  activeEvents(
    @Param('termId') termId: string,
    @Query('weekNo') weekNo?: string,
  ) {
    return this.investmentService.listActiveEvents(termId, weekNo);
  }

  @Get('terms/:termId/events')
  @NeededPermissions([PERMISSIONS.INVESTMENT.EVENT_VIEW])
  listTermEvents(
    @Param('termId') termId: string,
    @Query() query: ListTermEventsQueryDto,
  ) {
    return this.investmentService.listTermEvents(termId, query);
  }

  @Post('terms/:termId/products')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRODUCT_MANAGE])
  createProduct(
    @Param('termId') termId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.investmentService.createProduct(termId, dto);
  }

  @Patch('products/:productId')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRODUCT_MANAGE])
  updateProduct(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.investmentService.updateProduct(productId, dto);
  }

  @Patch('products/:productId/active')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRODUCT_MANAGE])
  setProductActive(
    @Param('productId') productId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.investmentService.setProductActive(productId, isActive);
  }

  @Post('terms/:termId/simulations')
  @NeededPermissions([PERMISSIONS.INVESTMENT.SIMULATION_MANAGE])
  upsertProductSimulations(
    @Param('termId') termId: string,
    @Body() dto: UpsertProductSimulationsDto,
  ) {
    return this.investmentService.upsertProductSimulations(termId, dto);
  }

  @Post('terms/:termId/term-simulation')
  @NeededPermissions([PERMISSIONS.INVESTMENT.SIMULATION_MANAGE])
  upsertTermSimulation(
    @Param('termId') termId: string,
    @Body() dto: UpsertTermSimulationDto,
  ) {
    return this.investmentService.upsertTermSimulation(termId, dto);
  }

  @Post('terms/:termId/prices/generate-week')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRICE_MANAGE])
  generateWeek(
    @Param('termId') termId: string,
    @Body() dto: GenerateWeekPriceDto,
  ) {
    return this.investmentService.generateWeekPrices(termId, dto);
  }

  @Post('terms/:termId/prices/generate-range')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRICE_MANAGE])
  generateRange(
    @Param('termId') termId: string,
    @Body() dto: GenerateRangePriceDto,
  ) {
    return this.investmentService.generateRangePrices(termId, dto);
  }

  @Post('terms/:termId/live-prices/generate-tick')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRICE_MANAGE])
  generateLiveTick(
    @Param('termId') termId: string,
    @Body() dto: GenerateLiveTicksDto,
  ) {
    return this.investmentService.generateLiveTicks(termId, dto);
  }

  @Post('terms/:termId/live-prices/finalize-week')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRICE_MANAGE])
  finalizeLiveWeek(
    @Param('termId') termId: string,
    @Body() dto: FinalizeLiveWeekDto,
  ) {
    return this.investmentService.finalizeLiveWeek(termId, dto);
  }

  @Post('terms/:termId/prices/manual')
  @NeededPermissions([PERMISSIONS.INVESTMENT.PRICE_MANAGE])
  manualPrices(
    @Param('termId') termId: string,
    @Body() dto: ManualProductPricesDto,
  ) {
    return this.investmentService.manualUpsertPrices(termId, dto);
  }

  @Post('economic-events')
  @NeededPermissions([PERMISSIONS.INVESTMENT.EVENT_MANAGE])
  createEconomicEvent(@Body() dto: CreateEconomicEventDto) {
    return this.investmentService.createEconomicEvent(dto);
  }

  @Patch('economic-events/:eventId')
  @NeededPermissions([PERMISSIONS.INVESTMENT.EVENT_MANAGE])
  updateEconomicEvent(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEconomicEventDto,
  ) {
    return this.investmentService.updateEconomicEvent(eventId, dto);
  }

  @Post('terms/:termId/term-events')
  @NeededPermissions([PERMISSIONS.INVESTMENT.EVENT_MANAGE])
  createTermEvent(
    @Param('termId') termId: string,
    @Body() dto: CreateTermEventDto,
  ) {
    return this.investmentService.createTermEvent(termId, dto);
  }

  @Patch('terms/:termId/term-events/:termEventId')
  @NeededPermissions([PERMISSIONS.INVESTMENT.EVENT_MANAGE])
  updateTermEvent(
    @Param('termId') termId: string,
    @Param('termEventId') termEventId: string,
    @Body() dto: UpdateTermEventDto,
  ) {
    return this.investmentService.updateTermEvent(termId, termEventId, dto);
  }

  @Post('terms/:termId/regimes')
  @NeededPermissions([PERMISSIONS.INVESTMENT.REGIME_MANAGE])
  createRegime(
    @Param('termId') termId: string,
    @Body() dto: CreateMarketRegimeDto,
  ) {
    return this.investmentService.createRegime(termId, dto);
  }

  @Patch('terms/:termId/regimes/:regimeId')
  @NeededPermissions([PERMISSIONS.INVESTMENT.REGIME_MANAGE])
  updateRegime(
    @Param('termId') termId: string,
    @Param('regimeId') regimeId: string,
    @Body() dto: UpdateMarketRegimeDto,
  ) {
    return this.investmentService.updateRegime(termId, regimeId, dto);
  }

  @Post('terms/:termId/jobs/process-orders')
  @NeededPermissions([PERMISSIONS.INVESTMENT.JOB_RUN])
  processOrders(
    @Param('termId') termId: string,
    @Body() dto: ProcessOrdersDto,
  ) {
    return this.investmentService.processPendingOrders(termId, dto);
  }

  @Post('terms/:termId/jobs/payouts')
  @NeededPermissions([PERMISSIONS.INVESTMENT.JOB_RUN])
  processPayouts(
    @Param('termId') termId: string,
    @Body() dto: ProcessPayoutsDto,
  ) {
    return this.investmentService.processPayouts(termId, dto);
  }
}
