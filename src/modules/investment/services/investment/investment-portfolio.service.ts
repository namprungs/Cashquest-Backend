import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BondPositionStatus,
  InvestmentTransactionType,
  OrderSide,
  OrderStatus,
  OrderType,
  ProductType,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { ListMyOrdersQueryDto } from '../../dto/list-my-orders-query.dto';
import { ProcessOrdersDto } from '../../dto/process-orders.dto';
import { ProcessPayoutsDto } from '../../dto/process-payouts.dto';
import {
  CurrentUser,
  InvestmentCoreService,
  TxClient,
} from './investment-core.service';
import { RandomExpenseService } from 'src/modules/random-expense/services/random-expense.service';

@Injectable()
export class InvestmentPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
    private readonly randomExpenseService: RandomExpenseService,
  ) {}

  async getMyPortfolio(termId: string, user: CurrentUser) {
    this.core.assertStudent(user);

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

    // Pre-fetch bond positions for bond valuation (constant value, no volatility)
    const bondPurchaseValueByHolding = new Map<string, number>();
    const bondHoldings = holdings.filter(
      (h) => (h.product?.type ?? '').toUpperCase() === 'BOND',
    );
    if (bondHoldings.length) {
      const bondPositions = await this.prisma.bondPosition.findMany({
        where: {
          termId,
          holding: { studentProfileId: profile.id },
          status: BondPositionStatus.ACTIVE,
        },
        select: { holdingId: true, units: true, purchasePrice: true },
      });
      for (const bp of bondPositions) {
        const val =
          this.core.toNumber(bp.units) * this.core.toNumber(bp.purchasePrice);
        bondPurchaseValueByHolding.set(
          bp.holdingId,
          (bondPurchaseValueByHolding.get(bp.holdingId) ?? 0) + val,
        );
      }
    }

    const items = holdings.map((holding) => {
      const units = this.core.toNumber(holding.units);
      const avgCost = this.core.toNumber(holding.avgCost);
      const productType = (holding.product?.type ?? '').toUpperCase();

      let costValue: number;
      let currentValue: number;

      if (productType === 'BOND') {
        const bondValue = bondPurchaseValueByHolding.get(holding.id) ?? 0;
        costValue = bondValue;
        currentValue = bondValue;
      } else {
        const latest = latestPriceByProduct.get(holding.productId);
        const latestLiveTick = latestLiveTickByProduct.get(holding.productId);
        const lastPrice = this.core.toNumber(
          latestLiveTick?.price ?? latest?.close ?? 0,
        );
        costValue = units * avgCost;
        currentValue = units * lastPrice;
      }

      const unrealizedPnL = currentValue - costValue;

      investedValue += costValue;
      marketValue += currentValue;

      if (productType === 'STOCK') {
        stockMarketValue += currentValue;
      } else if (productType === 'FUND') {
        fundMarketValue += currentValue;
      } else if (productType === 'BOND') {
        bondMarketValue += currentValue;
      }

      const effectivePrice =
        productType === 'BOND'
          ? units > 0
            ? currentValue / units
            : 0
          : this.core.toNumber(
              latestLiveTickByProduct.get(holding.productId)?.price ??
                latestPriceByProduct.get(holding.productId)?.close ??
                0,
            );

      return {
        holding,
        latestPrice: latestPriceByProduct.get(holding.productId),
        liveTickPrice:
          productType === 'BOND'
            ? null
            : (latestLiveTickByProduct.get(holding.productId)?.price ?? null),
        liveTickAt:
          productType === 'BOND'
            ? null
            : (latestLiveTickByProduct.get(holding.productId)?.tickedAt ??
              null),
        effectivePrice,
        metrics: {
          costValue,
          currentValue,
          unrealizedPnL,
        },
      };
    });

    const cash = this.core.toNumber(profile.investmentWallet?.balance ?? 0);
    const transferredIn = this.core.toNumber(transferInAgg._sum.amount ?? 0);
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
    this.core.assertStudent(user);

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
    this.core.assertStudent(user);
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

  async createOrder(termId: string, user: CurrentUser, dto: CreateOrderDto) {
    this.core.assertStudent(user);

    if (dto.orderType === OrderType.LIMIT && dto.requestedPrice === undefined) {
      throw new BadRequestException(
        'requestedPrice is required for LIMIT order',
      );
    }

    if (dto.quantity === undefined && dto.amount === undefined) {
      throw new BadRequestException('quantity or amount is required');
    }

    if (dto.quantity !== undefined && dto.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    if (dto.amount !== undefined && dto.amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: {
        id: true,
        type: true,
        metaJson: true,
        isActive: true,
      },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or inactive');
    }

    const simulation = await this.prisma.productSimulation.findUnique({
      where: {
        termId_productId: {
          termId,
          productId: dto.productId,
        },
      },
      select: {
        id: true,
        faceValue: true,
        couponRate: true,
        modifiedDuration: true,
      },
    });
    if (!simulation) {
      throw new NotFoundException('Product is not configured in this term');
    }

    const productMeta =
      product.metaJson &&
      typeof product.metaJson === 'object' &&
      !Array.isArray(product.metaJson)
        ? (product.metaJson as Record<string, unknown>)
        : {};
    const currentWeek = await this.core.getCurrentWeek(termId);
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { totalWeeks: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }

    const latestLiveTickInWeek =
      await this.prisma.productLivePriceTick.findFirst({
        where: {
          termId,
          productId: dto.productId,
          simulatedWeekNo: currentWeek,
        },
        orderBy: [{ tickedAt: 'desc' }],
        select: {
          price: true,
        },
      });

    const latestLiveTickAnyWeek = latestLiveTickInWeek
      ? null
      : await this.prisma.productLivePriceTick.findFirst({
          where: {
            termId,
            productId: dto.productId,
          },
          orderBy: [{ tickedAt: 'desc' }],
          select: {
            price: true,
          },
        });

    const latestPrice = await this.prisma.productPrice.findFirst({
      where: {
        termId,
        productId: dto.productId,
      },
      orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
      select: {
        close: true,
      },
    });

    const marketPrice = this.core.toNumber(
      latestLiveTickInWeek?.price ??
        latestLiveTickAnyWeek?.price ??
        latestPrice?.close ??
        0,
    );

    let status: OrderStatus = OrderStatus.PENDING;
    let executedPrice: number | null = null;

    if (dto.orderType === OrderType.MARKET) {
      if (marketPrice <= 0) {
        throw new BadRequestException(
          'Cannot execute market order without market price',
        );
      }
      status = OrderStatus.EXECUTED;
      executedPrice = marketPrice;
    }

    if (dto.amount !== undefined) {
      if (dto.side !== OrderSide.BUY) {
        throw new BadRequestException('amount order is only supported for BUY');
      }

      if (dto.orderType !== OrderType.MARKET || executedPrice === null) {
        throw new BadRequestException(
          'amount order is only supported for MARKET orders',
        );
      }
    }

    const orderQuantity =
      dto.amount !== undefined && executedPrice !== null
        ? dto.amount / executedPrice
        : dto.quantity;

    if (orderQuantity === undefined || orderQuantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    const fee = dto.fee ?? 0;

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          studentProfileId: profile.id,
          termId,
          productId: dto.productId,
          side: dto.side,
          orderType: dto.orderType,
          requestedPrice: dto.requestedPrice,
          executedPrice,
          quantity: orderQuantity,
          fee,
          weekNo: currentWeek,
          status,
        },
      });

      if (status === OrderStatus.EXECUTED && executedPrice !== null) {
        await this.applyExecutedOrder(tx, {
          orderId: order.id,
          studentProfileId: profile.id,
          termId,
          productId: dto.productId,
          productType: product.type,
          currentWeek,
          side: dto.side,
          quantity: orderQuantity,
          fee,
          executedPrice,
          amountOverride: dto.amount,
          bondConfig:
            product.type === ProductType.BOND
              ? {
                  faceValue: this.core.toNumber(simulation.faceValue),
                  couponRate: this.core.toNumber(simulation.couponRate),
                  couponIntervalDays:
                    this.core.toNumber(productMeta.couponIntervalDays) || 2,
                  maturityWeeks: Math.max(
                    1,
                    Math.round(
                      this.core.toNumber(productMeta.maturityWeeks) ||
                        term.totalWeeks,
                    ),
                  ),
                }
              : undefined,
        });
      }

      return tx.order.findUnique({
        where: { id: order.id },
      });
    });

    return { success: true, data: created };
  }

  async depositToInvestment(termId: string, user: CurrentUser, amount: number) {
    this.core.assertStudent(user);

    if (amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const data = await this.prisma.$transaction(async (tx) => {
      const mainWallet = await tx.wallet.upsert({
        where: { studentProfileId: profile.id },
        update: {},
        create: {
          studentProfileId: profile.id,
          balance: 0,
        },
        select: {
          id: true,
          balance: true,
        },
      });

      const investmentWallet = await tx.investmentWallet.findUnique({
        where: { studentProfileId: profile.id },
        select: {
          id: true,
          balance: true,
        },
      });

      if (!investmentWallet) {
        throw new NotFoundException(
          'Investment wallet not found. Please open investment wallet first',
        );
      }

      const mainBefore = this.core.toNumber(mainWallet.balance);
      if (mainBefore < amount) {
        throw new BadRequestException('Insufficient main wallet balance');
      }

      const mainAfter = mainBefore - amount;
      const investmentBefore = this.core.toNumber(investmentWallet.balance);
      const investmentAfter = investmentBefore + amount;

      const updatedMainWallet = await tx.wallet.update({
        where: { id: mainWallet.id },
        data: { balance: mainAfter },
      });

      await tx.investmentWallet.update({
        where: { id: investmentWallet.id },
        data: { balance: investmentAfter },
      });

      await tx.investmentTransaction.create({
        data: {
          investmentWalletId: investmentWallet.id,
          type: InvestmentTransactionType.TRANSFER_IN,
          amount,
          balanceBefore: investmentBefore,
          balanceAfter: investmentAfter,
          description: 'Transfer from main wallet to investment wallet',
          metadata: {
            source: 'MAIN_WALLET',
            refId: profile.id,
          },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: mainWallet.id,
          type: TransactionType.TRANSFER_OUT,
          amount,
          balanceBefore: mainBefore,
          balanceAfter: this.core.toNumber(updatedMainWallet.balance),
          description: 'Transfer to investment wallet',
          metadata: {
            source: 'INVESTMENT_TRANSFER_IN',
            refId: investmentWallet.id,
            termId,
          },
        },
      });

      return {
        mainWallet: {
          id: mainWallet.id,
          balanceBefore: mainBefore,
          balanceAfter: mainAfter,
        },
        investmentWallet: {
          id: investmentWallet.id,
          balanceBefore: investmentBefore,
          balanceAfter: investmentAfter,
        },
        amount,
      };
    });

    return { success: true, data };
  }

  async withdrawFromInvestment(
    termId: string,
    user: CurrentUser,
    amount: number,
  ) {
    this.core.assertStudent(user);

    if (amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const data = await this.prisma.$transaction(async (tx) => {
      const mainWallet = await tx.wallet.upsert({
        where: { studentProfileId: profile.id },
        update: {},
        create: {
          studentProfileId: profile.id,
          balance: 0,
        },
        select: {
          id: true,
          balance: true,
        },
      });

      const investmentWallet = await tx.investmentWallet.findUnique({
        where: { studentProfileId: profile.id },
        select: {
          id: true,
          balance: true,
        },
      });

      if (!investmentWallet) {
        throw new NotFoundException(
          'Investment wallet not found. Please open investment wallet first',
        );
      }

      const investmentBefore = this.core.toNumber(investmentWallet.balance);
      if (investmentBefore < amount) {
        throw new BadRequestException('Insufficient investment wallet balance');
      }

      const investmentAfter = investmentBefore - amount;
      const mainBefore = this.core.toNumber(mainWallet.balance);
      const mainAfter = mainBefore + amount;

      await tx.investmentWallet.update({
        where: { id: investmentWallet.id },
        data: { balance: investmentAfter },
      });

      const updatedMainWallet = await tx.wallet.update({
        where: { id: mainWallet.id },
        data: { balance: mainAfter },
      });

      await tx.investmentTransaction.create({
        data: {
          investmentWalletId: investmentWallet.id,
          type: InvestmentTransactionType.TRANSFER_OUT,
          amount,
          balanceBefore: investmentBefore,
          balanceAfter: investmentAfter,
          description: 'Transfer from investment wallet to main wallet',
          metadata: {
            source: 'MAIN_WALLET',
            refId: profile.id,
          },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: mainWallet.id,
          type: TransactionType.TRANSFER_IN,
          amount,
          balanceBefore: mainBefore,
          balanceAfter: this.core.toNumber(updatedMainWallet.balance),
          description: 'Transfer from investment wallet',
          metadata: {
            source: 'INVESTMENT_TRANSFER_OUT',
            refId: investmentWallet.id,
            termId,
          },
        },
      });

      const autoExpensePayment =
        await this.randomExpenseService.autoPayPendingExpensesFromWalletTx(
          tx,
          profile.id,
        );

      return {
        mainWallet: {
          id: mainWallet.id,
          balanceBefore: mainBefore,
          balanceAfter: this.core.toNumber(
            autoExpensePayment.walletBalanceAfter,
          ),
        },
        investmentWallet: {
          id: investmentWallet.id,
          balanceBefore: investmentBefore,
          balanceAfter: investmentAfter,
        },
        amount,
        autoExpensePayment,
      };
    });

    return { success: true, data };
  }

  private async applyExecutedOrder(
    tx: TxClient,
    params: {
      orderId: string;
      studentProfileId: string;
      termId: string;
      productId: string;
      productType?: ProductType;
      currentWeek: number;
      side: OrderSide;
      quantity: number;
      fee: number;
      executedPrice: number;
      amountOverride?: number;
      bondConfig?: {
        faceValue: number;
        couponRate: number;
        couponIntervalDays: number;
        maturityWeeks: number;
      };
    },
  ) {
    const amount =
      params.amountOverride ?? params.executedPrice * params.quantity;

    const investmentWallet = await tx.investmentWallet.findUnique({
      where: { studentProfileId: params.studentProfileId },
      select: {
        id: true,
        balance: true,
      },
    });

    if (!investmentWallet) {
      throw new NotFoundException(
        'Investment wallet not found. Please open investment wallet first',
      );
    }

    const holding = await tx.holding.findUnique({
      where: {
        studentProfileId_termId_productId: {
          studentProfileId: params.studentProfileId,
          termId: params.termId,
          productId: params.productId,
        },
      },
    });

    const product =
      params.productType === undefined
        ? await tx.product.findUnique({
            where: { id: params.productId },
            select: { type: true, metaJson: true },
          })
        : null;
    const productType = params.productType ?? product?.type;
    let bondConfig = params.bondConfig;
    if (!bondConfig && productType === ProductType.BOND) {
      const [sim, term] = await Promise.all([
        tx.productSimulation.findUnique({
          where: {
            termId_productId: {
              termId: params.termId,
              productId: params.productId,
            },
          },
          select: {
            faceValue: true,
            couponRate: true,
          },
        }),
        tx.term.findUnique({
          where: { id: params.termId },
          select: { totalWeeks: true },
        }),
      ]);

      if (sim && term) {
        const productMeta =
          product?.metaJson &&
          typeof product.metaJson === 'object' &&
          !Array.isArray(product.metaJson)
            ? (product.metaJson as Record<string, unknown>)
            : {};
        bondConfig = {
          faceValue: this.core.toNumber(sim.faceValue),
          couponRate: this.core.toNumber(sim.couponRate),
          couponIntervalDays:
            this.core.toNumber(productMeta.couponIntervalDays) || 2,
          maturityWeeks: Math.max(
            1,
            Math.round(
              this.core.toNumber(productMeta.maturityWeeks) || term.totalWeeks,
            ),
          ),
        };
      }
    }

    if (params.side === OrderSide.BUY) {
      const totalCost = amount + params.fee;
      const walletBalance = this.core.toNumber(investmentWallet.balance);
      if (walletBalance < totalCost) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const updatedInvestmentWallet = await tx.investmentWallet.update({
        where: { id: investmentWallet.id },
        data: {
          balance: walletBalance - totalCost,
        },
      });

      await tx.investmentTransaction.create({
        data: {
          investmentWalletId: investmentWallet.id,
          type: InvestmentTransactionType.STOCK_BUY,
          amount: totalCost,
          balanceBefore: walletBalance,
          balanceAfter: this.core.toNumber(updatedInvestmentWallet.balance),
          description: 'Stock buy order executed',
          metadata: {
            refId: params.orderId,
            side: params.side,
            quantity: params.quantity,
            executedPrice: params.executedPrice,
            grossAmount: amount,
            fee: params.fee,
          },
        },
      });

      let updatedHolding = holding;
      if (!updatedHolding) {
        updatedHolding = await tx.holding.create({
          data: {
            studentProfileId: params.studentProfileId,
            termId: params.termId,
            productId: params.productId,
            units: params.quantity,
            avgCost: params.executedPrice,
          },
        });
      } else {
        const oldUnits = this.core.toNumber(updatedHolding.units);
        const oldAvg = this.core.toNumber(updatedHolding.avgCost);
        const newUnits = oldUnits + params.quantity;
        const newAvg =
          newUnits === 0
            ? 0
            : (oldUnits * oldAvg + params.quantity * params.executedPrice) /
              newUnits;

        updatedHolding = await tx.holding.update({
          where: { id: updatedHolding.id },
          data: {
            units: newUnits,
            avgCost: newAvg,
          },
        });
      }

      if (productType === ProductType.BOND && bondConfig) {
        const faceValue =
          bondConfig.faceValue > 0
            ? bondConfig.faceValue
            : params.executedPrice;
        const bondTermWeeks = bondConfig.maturityWeeks;
        await tx.bondPosition.create({
          data: {
            termId: params.termId,
            holdingId: updatedHolding.id,
            units: params.quantity,
            faceValue,
            couponRate: bondConfig.couponRate,
            couponIntervalDays: bondConfig.couponIntervalDays,
            startWeekNo: params.currentWeek,
            maturityWeekNo: params.currentWeek + bondConfig.maturityWeeks,
            maturityDate: new Date(
              Date.now() + bondTermWeeks * 7 * 24 * 60 * 60 * 1000,
            ),
            purchasePrice: params.executedPrice,
            purchaseAmount: params.quantity * params.executedPrice,
          },
        });
      }
    } else {
      if (!holding) {
        throw new BadRequestException('No holding found for this product');
      }

      const oldUnits = this.core.toNumber(holding.units);
      if (oldUnits < params.quantity) {
        throw new BadRequestException('Insufficient units to sell');
      }

      const proceeds = amount - params.fee;
      if (proceeds < 0) {
        throw new BadRequestException('Fee exceeds sell amount');
      }

      const walletBalance = this.core.toNumber(investmentWallet.balance);
      const nextUnits = oldUnits - params.quantity;

      const updatedInvestmentWallet = await tx.investmentWallet.update({
        where: { id: investmentWallet.id },
        data: {
          balance: walletBalance + proceeds,
        },
      });

      await tx.investmentTransaction.create({
        data: {
          investmentWalletId: investmentWallet.id,
          type: InvestmentTransactionType.STOCK_SELL,
          amount: proceeds,
          balanceBefore: walletBalance,
          balanceAfter: this.core.toNumber(updatedInvestmentWallet.balance),
          description: 'Stock sell order executed',
          metadata: {
            refId: params.orderId,
            side: params.side,
            quantity: params.quantity,
            executedPrice: params.executedPrice,
            grossAmount: amount,
            fee: params.fee,
          },
        },
      });

      if (nextUnits === 0) {
        await tx.holding.delete({
          where: { id: holding.id },
        });
      } else {
        await tx.holding.update({
          where: { id: holding.id },
          data: {
            units: nextUnits,
            avgCost: holding.avgCost,
          },
        });
      }

      if (productType === ProductType.BOND) {
        let remainingToClose = params.quantity;
        const positions = await tx.bondPosition.findMany({
          where: {
            termId: params.termId,
            holdingId: holding.id,
            status: BondPositionStatus.ACTIVE,
          },
          orderBy: [{ createdAt: 'asc' }],
        });

        for (const position of positions) {
          if (remainingToClose <= 0) {
            break;
          }

          const positionUnits = this.core.toNumber(position.units);
          if (positionUnits <= remainingToClose + 0.000001) {
            await tx.bondPosition.update({
              where: { id: position.id },
              data: { units: 0, status: BondPositionStatus.CLOSED },
            });
            remainingToClose -= positionUnits;
          } else {
            await tx.bondPosition.update({
              where: { id: position.id },
              data: { units: positionUnits - remainingToClose },
            });
            remainingToClose = 0;
          }
        }
      }
    }

    await tx.order.update({
      where: { id: params.orderId },
      data: {
        status: OrderStatus.EXECUTED,
        executedPrice: params.executedPrice,
      },
    });
  }

  async listMyOrders(
    termId: string,
    user: CurrentUser,
    query: ListMyOrdersQueryDto,
  ) {
    this.core.assertStudent(user);

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
    this.core.assertStudent(user);

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
    this.core.assertStudent(user);

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
    this.core.assertStudent(user);

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

  async processPendingOrders(termId: string, dto: ProcessOrdersDto) {
    await this.core.assertTermExists(termId);

    const weekNo = dto.weekNo ?? (await this.core.getCurrentWeek(termId));

    const pendingOrders = await this.prisma.order.findMany({
      where: {
        termId,
        status: OrderStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
    });

    const executedIds: string[] = [];
    const cancelledIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const order of pendingOrders) {
        const market = await tx.productPrice.findFirst({
          where: {
            termId,
            productId: order.productId,
            weekNo: { lte: weekNo },
          },
          orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
          select: {
            close: true,
          },
        });

        const marketPrice = this.core.toNumber(market?.close ?? 0);
        if (marketPrice <= 0) {
          continue;
        }

        const limitPrice = this.core.toNumber(order.requestedPrice);

        const canExecute =
          order.orderType === OrderType.MARKET ||
          (order.side === OrderSide.BUY && marketPrice <= limitPrice) ||
          (order.side === OrderSide.SELL && marketPrice >= limitPrice);

        if (!canExecute) {
          continue;
        }

        try {
          await this.applyExecutedOrder(tx, {
            orderId: order.id,
            studentProfileId: order.studentProfileId,
            termId: order.termId,
            productId: order.productId,
            productType: undefined,
            currentWeek: weekNo,
            side: order.side,
            quantity: this.core.toNumber(order.quantity),
            fee: this.core.toNumber(order.fee),
            executedPrice: marketPrice,
          });
          executedIds.push(order.id);
        } catch {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CANCELLED,
            },
          });
          cancelledIds.push(order.id);
        }
      }
    });

    return {
      success: true,
      data: {
        weekNo,
        totalPending: pendingOrders.length,
        executedCount: executedIds.length,
        cancelledCount: cancelledIds.length,
        executedIds,
        cancelledIds,
      },
    };
  }

  async processPayouts(termId: string, dto: ProcessPayoutsDto) {
    await this.core.assertTermExists(termId);

    const weekNo = dto.weekNo ?? (await this.core.getCurrentWeek(termId));
    const manualDividendPerUnit = dto.dividendPerUnit;

    let dividendCount = 0;
    let couponCount = 0;

    await this.prisma.$transaction(async (tx) => {
      const holdings = await tx.holding.findMany({
        where: {
          termId,
          units: {
            gt: 0,
          },
          product: {
            type: ProductType.STOCK,
            isDividendEnabled: true,
          },
        },
        include: {
          product: true,
          studentProfile: {
            include: {
              investmentWallet: true,
            },
          },
        },
      });

      for (const holding of holdings) {
        const intervalWeeks = Math.max(
          1,
          holding.product.dividendPayoutIntervalWeeks ?? 4,
        );

        if (weekNo % intervalWeeks !== 0) {
          continue;
        }

        const existingDividend = await tx.dividendPayout.findFirst({
          where: {
            termId,
            productId: holding.productId,
            studentProfileId: holding.studentProfileId,
            weekNo,
          },
          select: { id: true },
        });

        if (existingDividend) {
          continue;
        }

        const units = this.core.toNumber(holding.units);
        let dividendPerUnit = manualDividendPerUnit;

        if (dividendPerUnit === undefined || dividendPerUnit <= 0) {
          dividendPerUnit = this.core.toNumber(
            holding.product.fixedDividendPerUnit ?? 0,
          );
        }

        if (dividendPerUnit <= 0) {
          const yieldAnnual = this.core.toNumber(
            holding.product.dividendYieldAnnual ?? 0,
          );
          if (yieldAnnual > 0) {
            const latestPrice = await tx.productPrice.findFirst({
              where: {
                termId,
                productId: holding.productId,
                weekNo: { lte: weekNo },
              },
              orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
              select: { close: true },
            });

            const closePrice = this.core.toNumber(latestPrice?.close ?? 0);
            const payoutsPerYear = Math.max(1, 52 / intervalWeeks);
            dividendPerUnit =
              closePrice > 0 ? (closePrice * yieldAnnual) / payoutsPerYear : 0;
          }
        }

        if (dividendPerUnit <= 0) {
          continue;
        }

        const amount = units * dividendPerUnit;

        await tx.dividendPayout.create({
          data: {
            termId,
            productId: holding.productId,
            studentProfileId: holding.studentProfileId,
            weekNo,
            units,
            dividendPerUnit,
            amount,
          },
        });

        if (holding.studentProfile.investmentWallet) {
          const walletBalance = this.core.toNumber(
            holding.studentProfile.investmentWallet.balance,
          );
          await tx.investmentWallet.update({
            where: { id: holding.studentProfile.investmentWallet.id },
            data: {
              balance: walletBalance + amount,
            },
          });

          await tx.investmentTransaction.create({
            data: {
              investmentWalletId: holding.studentProfile.investmentWallet.id,
              type: InvestmentTransactionType.DIVIDEND,
              amount,
              balanceBefore: walletBalance,
              balanceAfter: walletBalance + amount,
              description: 'Dividend payout credited to investment wallet',
              metadata: {
                source: 'DIVIDEND_PAYOUT',
                productId: holding.productId,
                termId,
                weekNo,
                intervalWeeks,
              },
            },
          });
        }

        dividendCount += 1;
      }

      const bonds = await tx.bondPosition.findMany({
        where: {
          termId,
          status: BondPositionStatus.ACTIVE,
          maturityDate: { gte: new Date() },
        },
        include: {
          holding: {
            include: {
              studentProfile: {
                include: {
                  investmentWallet: true,
                },
              },
            },
          },
        },
      });

      for (const bond of bonds) {
        const elapsedDays = Math.floor(
          (Date.now() - bond.createdAt.getTime()) / (24 * 60 * 60 * 1000),
        );
        if (elapsedDays < bond.couponIntervalDays) {
          continue;
        }

        const intervalIndex = Math.floor(elapsedDays / bond.couponIntervalDays);

        const already = await tx.bondCouponPayout.findFirst({
          where: {
            bondPositionId: bond.id,
            weekNo: intervalIndex,
          },
          select: { id: true },
        });

        if (already) {
          continue;
        }

        const couponAmount =
          this.core.toNumber(bond.faceValue) *
          this.core.toNumber(bond.couponRate) *
          (bond.couponIntervalDays / 365) *
          this.core.toNumber(bond.units);

        await tx.bondCouponPayout.create({
          data: {
            bondPositionId: bond.id,
            weekNo: intervalIndex,
            amount: couponAmount,
          },
        });

        if (bond.holding.studentProfile.investmentWallet) {
          const walletBalance = this.core.toNumber(
            bond.holding.studentProfile.investmentWallet.balance,
          );
          await tx.investmentWallet.update({
            where: { id: bond.holding.studentProfile.investmentWallet.id },
            data: {
              balance: walletBalance + couponAmount,
            },
          });

          await tx.investmentTransaction.create({
            data: {
              investmentWalletId:
                bond.holding.studentProfile.investmentWallet.id,
              type: InvestmentTransactionType.COUPON,
              amount: couponAmount,
              balanceBefore: walletBalance,
              balanceAfter: walletBalance + couponAmount,
              description: 'Bond coupon payout credited to investment wallet',
              metadata: {
                source: 'BOND_COUPON_PAYOUT',
                bondPositionId: bond.id,
                termId,
                intervalIndex,
                units: this.core.toNumber(bond.units),
                couponIntervalDays: bond.couponIntervalDays,
              },
            },
          });
        }

        couponCount += 1;
      }

      // Mark bonds past maturity as MATURED
      const maturedBonds = await tx.bondPosition.updateMany({
        where: {
          termId,
          status: BondPositionStatus.ACTIVE,
          maturityDate: { lt: new Date() },
        },
        data: {
          status: BondPositionStatus.MATURED,
        },
      });

      const maturedCount = maturedBonds.count;

      return {
        success: true,
        data: {
          weekNo,
          dividendCount,
          couponCount,
          maturedCount,
        },
      };
    });
  }

  async redeemBond(termId: string, bondPositionId: string, user: CurrentUser) {
    this.core.assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const bond = await this.prisma.bondPosition.findUnique({
      where: { id: bondPositionId },
      include: {
        holding: {
          include: {
            studentProfile: {
              include: { investmentWallet: true },
            },
          },
        },
      },
    });

    if (!bond) {
      throw new NotFoundException('Bond position not found');
    }

    if (bond.holding.studentProfileId !== profile.id) {
      throw new BadRequestException('Not your bond position');
    }

    if (bond.status !== BondPositionStatus.MATURED) {
      throw new BadRequestException('Bond has not matured yet');
    }

    const wallet = bond.holding.studentProfile.investmentWallet;
    if (!wallet) {
      throw new BadRequestException('No investment wallet found');
    }

    const principalAmount = this.core.toNumber(bond.purchaseAmount);
    const walletBalance = this.core.toNumber(wallet.balance);

    return this.prisma.$transaction(async (tx) => {
      await tx.bondPosition.update({
        where: { id: bondPositionId },
        data: { status: BondPositionStatus.CLOSED },
      });

      await tx.investmentWallet.update({
        where: { id: wallet.id },
        data: { balance: walletBalance + principalAmount },
      });

      await tx.investmentTransaction.create({
        data: {
          investmentWalletId: wallet.id,
          type: InvestmentTransactionType.REDEEM,
          amount: principalAmount,
          balanceBefore: walletBalance,
          balanceAfter: walletBalance + principalAmount,
          description: 'Bond principal redeemed after maturity',
          metadata: {
            source: 'BOND_PRINCIPAL_REDEEM',
            bondPositionId,
            termId,
            units: this.core.toNumber(bond.units),
          },
        },
      });

      return {
        success: true,
        data: {
          bondPositionId,
          principalAmount,
          creditedToWallet: principalAmount,
        },
      };
    });
  }
}
