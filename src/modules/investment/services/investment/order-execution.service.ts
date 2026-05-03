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
import { toNumber } from 'src/common/utils/number.utils';
import { assertStudent } from 'src/common/utils/role.utils';
import type { CurrentUser } from 'src/common/types/current-user.type';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { ProcessOrdersDto } from '../../dto/process-orders.dto';
import { InvestmentCoreService, TxClient } from './investment-core.service';
import { RandomExpenseService } from 'src/modules/random-expense/services/random-expense.service';

@Injectable()
export class OrderExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
    private readonly randomExpenseService: RandomExpenseService,
  ) {}

  async createOrder(termId: string, user: CurrentUser, dto: CreateOrderDto) {
    assertStudent(user);

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

    const marketPrice = toNumber(
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
                  faceValue: toNumber(simulation.faceValue),
                  couponRate: toNumber(simulation.couponRate),
                  couponIntervalWeeks: 4,
                  maturityWeeks: Math.max(
                    0,
                    Math.min(
                      term.totalWeeks,
                      Math.round(
                        toNumber(productMeta.maturityWeeks) || term.totalWeeks,
                      ),
                    ) - currentWeek,
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
    assertStudent(user);

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

      const mainBefore = toNumber(mainWallet.balance);
      if (mainBefore < amount) {
        throw new BadRequestException('Insufficient main wallet balance');
      }

      const mainAfter = mainBefore - amount;
      const investmentBefore = toNumber(investmentWallet.balance);
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
          balanceAfter: toNumber(updatedMainWallet.balance),
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
    assertStudent(user);

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

      const investmentBefore = toNumber(investmentWallet.balance);
      if (investmentBefore < amount) {
        throw new BadRequestException('Insufficient investment wallet balance');
      }

      const investmentAfter = investmentBefore - amount;
      const mainBefore = toNumber(mainWallet.balance);
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
          balanceAfter: toNumber(updatedMainWallet.balance),
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
          balanceAfter: toNumber(autoExpensePayment.walletBalanceAfter),
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
        couponIntervalWeeks: number;
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
          faceValue: toNumber(sim.faceValue),
          couponRate: toNumber(sim.couponRate),
          couponIntervalWeeks: 4,
          maturityWeeks: Math.max(
            0,
            Math.min(
              term.totalWeeks,
              Math.round(
                toNumber(productMeta.maturityWeeks) || term.totalWeeks,
              ),
            ) - params.currentWeek,
          ),
        };
      }
    }

    if (params.side === OrderSide.BUY) {
      const totalCost = amount + params.fee;
      const walletBalance = toNumber(investmentWallet.balance);
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
          balanceAfter: toNumber(updatedInvestmentWallet.balance),
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
        const oldUnits = toNumber(updatedHolding.units);
        const oldAvg = toNumber(updatedHolding.avgCost);
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
        await tx.bondPosition.create({
          data: {
            termId: params.termId,
            holdingId: updatedHolding.id,
            units: params.quantity,
            faceValue,
            couponRate: bondConfig.couponRate,
            couponIntervalWeeks: bondConfig.couponIntervalWeeks,
            startWeekNo: params.currentWeek,
            maturityWeekNo: params.currentWeek + bondConfig.maturityWeeks,
          },
        });
      }
    } else {
      if (!holding) {
        throw new BadRequestException('No holding found for this product');
      }

      const oldUnits = toNumber(holding.units);
      if (oldUnits < params.quantity) {
        throw new BadRequestException('Insufficient units to sell');
      }

      const proceeds = amount - params.fee;
      if (proceeds < 0) {
        throw new BadRequestException('Fee exceeds sell amount');
      }

      const walletBalance = toNumber(investmentWallet.balance);
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
          balanceAfter: toNumber(updatedInvestmentWallet.balance),
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

          const positionUnits = toNumber(position.units);
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

        const marketPrice = toNumber(market?.close ?? 0);
        if (marketPrice <= 0) {
          continue;
        }

        const limitPrice = toNumber(order.requestedPrice);

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
            quantity: toNumber(order.quantity),
            fee: toNumber(order.fee),
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
}
