import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvestmentTransactionType, OrderStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { toNumber } from 'src/common/utils/number.utils';
import { assertStudent } from 'src/common/utils/role.utils';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { ListMyOrdersQueryDto } from '../../dto/list-my-orders-query.dto';
import { InvestmentCoreService } from './investment-core.service';

@Injectable()
export class PortfolioQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
  ) {}

  async getMyPortfolio(termId: string, user: CurrentUser) {
    assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);
    const currentWeek = await this.core.getCurrentWeek(termId);

    const transferInAgg = await this.prisma.investmentTransaction.aggregate({
      where: {
        investmentWallet: {
          studentProfileId: profile.id,
          termId,
        },
        type: InvestmentTransactionType.TRANSFER_IN,
        metadata: {
          path: ['source'],
          equals: 'MAIN_WALLET',
        },
      },
      _sum: {
        amount: true,
      },
    });

    const holdings = await this.prisma.holding.findMany({
      where: {
        termId,
        studentProfileId: profile.id,
        units: {
          gt: 0,
        },
      },
      include: {
        product: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const productIds = holdings.map((holding) => holding.productId);
    const latestPrices = productIds.length
      ? await this.prisma.productPrice.findMany({
          where: {
            termId,
            productId: {
              in: productIds,
            },
          },
          orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
        })
      : [];

    const latestPriceByProduct = new Map<
      string,
      (typeof latestPrices)[number]
    >();
    for (const row of latestPrices) {
      if (!latestPriceByProduct.has(row.productId)) {
        latestPriceByProduct.set(row.productId, row);
      }
    }

    const liveTicks = productIds.length
      ? await this.prisma.productLivePriceTick.findMany({
          where: {
            termId,
            productId: {
              in: productIds,
            },
            simulatedWeekNo: currentWeek,
          },
          orderBy: [{ tickedAt: 'desc' }],
        })
      : [];

    const latestLiveTickByProduct = new Map<
      string,
      (typeof liveTicks)[number]
    >();
    for (const tick of liveTicks) {
      if (!latestLiveTickByProduct.has(tick.productId)) {
        latestLiveTickByProduct.set(tick.productId, tick);
      }
    }

    const fallbackLiveTicks =
      productIds.length && latestLiveTickByProduct.size < productIds.length
        ? await this.prisma.productLivePriceTick.findMany({
            where: {
              termId,
              productId: {
                in: productIds,
              },
            },
            orderBy: [{ tickedAt: 'desc' }],
          })
        : [];

    for (const tick of fallbackLiveTicks) {
      if (!latestLiveTickByProduct.has(tick.productId)) {
        latestLiveTickByProduct.set(tick.productId, tick);
      }
    }

    let investedValue = 0;
    let marketValue = 0;
    let stockMarketValue = 0;
    let fundMarketValue = 0;
    let bondMarketValue = 0;

    const items = holdings.map((holding) => {
      const units = toNumber(holding.units);
      const avgCost = toNumber(holding.avgCost);
      const latest = latestPriceByProduct.get(holding.productId);
      const latestLiveTick = latestLiveTickByProduct.get(holding.productId);
      const lastPrice = toNumber(latestLiveTick?.price ?? latest?.close ?? 0);

      const costValue = units * avgCost;
      const currentValue = units * lastPrice;
      const unrealizedPnL = currentValue - costValue;

      investedValue += costValue;
      marketValue += currentValue;

      const productType = (holding.product?.type ?? '').toUpperCase();
      if (productType === 'STOCK') {
        stockMarketValue += currentValue;
      } else if (productType === 'FUND') {
        fundMarketValue += currentValue;
      } else if (productType === 'BOND') {
        bondMarketValue += currentValue;
      }

      return {
        holding,
        latestPrice: latest,
        liveTickPrice: latestLiveTick?.price ?? null,
        liveTickAt: latestLiveTick?.tickedAt ?? null,
        effectivePrice: lastPrice,
        metrics: {
          costValue,
          currentValue,
          unrealizedPnL,
        },
      };
    });

    const cash = toNumber(profile.investmentWallet?.balance ?? 0);
    const transferredIn = toNumber(transferInAgg._sum.amount ?? 0);
    const hasInvestmentWallet = profile.investmentWallet != null;
    const investmentWalletId = profile.investmentWallet?.id ?? null;
    const equity = cash + marketValue;
    const roiPercent =
      investedValue > 0
        ? ((marketValue - investedValue) / investedValue) * 100
        : transferredIn > 0
          ? ((equity - transferredIn) / transferredIn) * 100
          : 0;

    return {
      success: true,
      data: {
        studentProfileId: profile.id,
        cash,
        investedValue,
        marketValue,
        stockValue: stockMarketValue,
        fundValue: fundMarketValue,
        bondValue: bondMarketValue,
        equity,
        unrealizedPnL: marketValue - investedValue,
        transferredIn,
        roiPercent,
        hasInvestmentWallet,
        investmentWalletId,
        holdings: items,
      },
    };
  }

  private isStudentLifeStageName(name: string) {
    const normalized = name.trim().toLowerCase();
    return (
      normalized === 'วัยนักศึกษา' ||
      normalized === 'student' ||
      normalized === 'high_school'
    );
  }

  async openInvestmentWallet(termId: string, user: CurrentUser) {
    assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);
    const currentWeek = await this.core.getCurrentWeek(termId);

    const activeStageRule = await this.prisma.termStageRule.findFirst({
      where: {
        termId,
        startWeek: { lte: currentWeek },
        endWeek: { gte: currentWeek },
      },
      include: {
        lifeStage: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startWeek: 'desc',
      },
    });

    if (!activeStageRule?.lifeStage?.name) {
      throw new BadRequestException(
        'Cannot open investment wallet: life stage is not configured for current week',
      );
    }

    if (!this.isStudentLifeStageName(activeStageRule.lifeStage.name)) {
      throw new BadRequestException(
        'Cannot open investment wallet: allowed only in life stage "วัยนักศึกษา"',
      );
    }

    const wallet = await this.prisma.investmentWallet.upsert({
      where: { studentProfileId: profile.id },
      update: {},
      create: {
        studentProfileId: profile.id,
        termId,
        balance: 0,
      },
    });

    return {
      success: true,
      data: {
        wallet,
        lifeStage: activeStageRule.lifeStage,
        currentWeek,
      },
    };
  }

  async getMyHoldings(termId: string, user: CurrentUser) {
    assertStudent(user);
    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const data = await this.prisma.holding.findMany({
      where: {
        termId,
        studentProfileId: profile.id,
        units: {
          gt: 0,
        },
      },
      include: {
        product: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return { success: true, data };
  }

  async listMyOrders(
    termId: string,
    user: CurrentUser,
    query: ListMyOrdersQueryDto,
  ) {
    assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const data = await this.prisma.order.findMany({
      where: {
        termId,
        studentProfileId: profile.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.weekNo !== undefined ? { weekNo: query.weekNo } : {}),
      },
      include: {
        product: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return { success: true, data };
  }

  async cancelOrder(termId: string, orderId: string, user: CurrentUser) {
    assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        termId,
        studentProfileId: profile.id,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending order can be cancelled');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    return { success: true, data: updated };
  }

  async listMyDividends(termId: string, user: CurrentUser) {
    assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const data = await this.prisma.dividendPayout.findMany({
      where: {
        termId,
        studentProfileId: profile.id,
      },
      include: {
        product: true,
      },
      orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
    });

    return { success: true, data };
  }

  async listMyBonds(termId: string, user: CurrentUser) {
    assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const data = await this.prisma.bondPosition.findMany({
      where: {
        termId,
        holding: {
          studentProfileId: profile.id,
        },
      },
      include: {
        holding: {
          include: {
            product: true,
          },
        },
        couponPayouts: {
          orderBy: { weekNo: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data };
  }
}
