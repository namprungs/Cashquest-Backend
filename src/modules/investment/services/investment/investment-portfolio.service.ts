import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { InvestmentWalletTransferDto } from '../../dto/investment-wallet-transfer.dto';
import { ListMyOrdersQueryDto } from '../../dto/list-my-orders-query.dto';
import { ProcessOrdersDto } from '../../dto/process-orders.dto';
import { ProcessPayoutsDto } from '../../dto/process-payouts.dto';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { PortfolioQueryService } from './portfolio-query.service';
import { OrderExecutionService } from './order-execution.service';
import { PayoutService } from './payout.service';

@Injectable()
export class InvestmentPortfolioService {
  constructor(
    private readonly queryService: PortfolioQueryService,
    private readonly orderService: OrderExecutionService,
    private readonly payoutService: PayoutService,
  ) {}

  getMyPortfolio(termId: string, user: CurrentUser) {
    return this.queryService.getMyPortfolio(termId, user);
  }

  openInvestmentWallet(termId: string, user: CurrentUser) {
    return this.queryService.openInvestmentWallet(termId, user);
  }

  getMyHoldings(termId: string, user: CurrentUser) {
    return this.queryService.getMyHoldings(termId, user);
  }

  listMyOrders(termId: string, user: CurrentUser, query: ListMyOrdersQueryDto) {
    return this.queryService.listMyOrders(termId, user, query);
  }

  cancelOrder(termId: string, orderId: string, user: CurrentUser) {
    return this.queryService.cancelOrder(termId, orderId, user);
  }

  listMyDividends(termId: string, user: CurrentUser) {
    return this.queryService.listMyDividends(termId, user);
  }

  listMyBonds(termId: string, user: CurrentUser) {
    return this.queryService.listMyBonds(termId, user);
  }

  createOrder(termId: string, user: CurrentUser, dto: CreateOrderDto) {
    return this.orderService.createOrder(termId, user, dto);
  }

  depositToInvestment(termId: string, user: CurrentUser, amount: number) {
    return this.orderService.depositToInvestment(termId, user, amount);
  }

  withdrawFromInvestment(termId: string, user: CurrentUser, amount: number) {
    return this.orderService.withdrawFromInvestment(termId, user, amount);
  }

  processPendingOrders(termId: string, dto: ProcessOrdersDto) {
    return this.orderService.processPendingOrders(termId, dto);
  }

  processPayouts(termId: string, dto: ProcessPayoutsDto) {
    return this.payoutService.processPayouts(termId, dto);
  }
}
