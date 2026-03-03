import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BondPositionStatus,
  OrderSide,
  OrderStatus,
  OrderType,
  ProductType,
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

@Injectable()
export class InvestmentPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
  ) {}

  async getMyPortfolio(termId: string, user: CurrentUser) {
    this.core.assertStudent(user);

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const holdings = await this.prisma.holding.findMany({
      where: {
        termId,
        studentProfileId: profile.id,
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

    let investedValue = 0;
    let marketValue = 0;

    const items = holdings.map((holding) => {
      const units = this.core.toNumber(holding.units);
      const avgCost = this.core.toNumber(holding.avgCost);
      const latest = latestPriceByProduct.get(holding.productId);
      const lastPrice = this.core.toNumber(latest?.close ?? 0);

      const costValue = units * avgCost;
      const currentValue = units * lastPrice;
      const unrealizedPnL = currentValue - costValue;

      investedValue += costValue;
      marketValue += currentValue;

      return {
        holding,
        latestPrice: latest,
        metrics: {
          costValue,
          currentValue,
          unrealizedPnL,
        },
      };
    });

    const cash = this.core.toNumber(profile.wallet?.balance ?? 0);

    return {
      success: true,
      data: {
        studentProfileId: profile.id,
        cash,
        investedValue,
        marketValue,
        equity: cash + marketValue,
        unrealizedPnL: marketValue - investedValue,
        holdings: items,
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

    if (dto.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    const profile = await this.core.getStudentProfileOrThrow(user.id, termId);

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: {
        id: true,
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
      select: { id: true },
    });
    if (!simulation) {
      throw new NotFoundException('Product is not configured in this term');
    }

    const currentWeek = await this.core.getCurrentWeek(termId);

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

    const marketPrice = this.core.toNumber(latestPrice?.close ?? 0);

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
          quantity: dto.quantity,
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
          side: dto.side,
          quantity: dto.quantity,
          fee,
          executedPrice,
        });
      }

      return tx.order.findUnique({
        where: { id: order.id },
      });
    });

    return { success: true, data: created };
  }

  private async applyExecutedOrder(
    tx: TxClient,
    params: {
      orderId: string;
      studentProfileId: string;
      termId: string;
      productId: string;
      side: OrderSide;
      quantity: number;
      fee: number;
      executedPrice: number;
    },
  ) {
    const amount = params.executedPrice * params.quantity;

    const profile = await tx.studentProfile.findUnique({
      where: { id: params.studentProfileId },
      select: {
        id: true,
        wallet: {
          select: {
            id: true,
            balance: true,
          },
        },
      },
    });

    if (!profile?.wallet) {
      throw new BadRequestException(
        'Wallet not found for this student profile',
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

    if (params.side === OrderSide.BUY) {
      const totalCost = amount + params.fee;
      const walletBalance = this.core.toNumber(profile.wallet.balance);
      if (walletBalance < totalCost) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      await tx.wallet.update({
        where: { id: profile.wallet.id },
        data: {
          balance: walletBalance - totalCost,
        },
      });

      if (!holding) {
        await tx.holding.create({
          data: {
            studentProfileId: params.studentProfileId,
            termId: params.termId,
            productId: params.productId,
            units: params.quantity,
            avgCost: params.executedPrice,
          },
        });
      } else {
        const oldUnits = this.core.toNumber(holding.units);
        const oldAvg = this.core.toNumber(holding.avgCost);
        const newUnits = oldUnits + params.quantity;
        const newAvg =
          newUnits === 0
            ? 0
            : (oldUnits * oldAvg + params.quantity * params.executedPrice) /
              newUnits;

        await tx.holding.update({
          where: { id: holding.id },
          data: {
            units: newUnits,
            avgCost: newAvg,
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
      const walletBalance = this.core.toNumber(profile.wallet.balance);
      const nextUnits = oldUnits - params.quantity;

      await tx.wallet.update({
        where: { id: profile.wallet.id },
        data: {
          balance: walletBalance + proceeds,
        },
      });

      await tx.holding.update({
        where: { id: holding.id },
        data: {
          units: nextUnits,
          avgCost: nextUnits === 0 ? 0 : holding.avgCost,
        },
      });
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
    const dividendPerUnit = dto.dividendPerUnit ?? 0;

    let dividendCount = 0;
    let couponCount = 0;

    await this.prisma.$transaction(async (tx) => {
      if (dividendPerUnit > 0) {
        const holdings = await tx.holding.findMany({
          where: {
            termId,
            units: {
              gt: 0,
            },
            product: {
              type: {
                in: [ProductType.STOCK, ProductType.FUND],
              },
            },
          },
          include: {
            product: true,
            studentProfile: {
              include: {
                wallet: true,
              },
            },
          },
        });

        for (const holding of holdings) {
          const units = this.core.toNumber(holding.units);
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

          if (holding.studentProfile.wallet) {
            const walletBalance = this.core.toNumber(
              holding.studentProfile.wallet.balance,
            );
            await tx.wallet.update({
              where: { id: holding.studentProfile.wallet.id },
              data: {
                balance: walletBalance + amount,
              },
            });
          }

          dividendCount += 1;
        }
      }

      const bonds = await tx.bondPosition.findMany({
        where: {
          termId,
          status: BondPositionStatus.ACTIVE,
          startWeekNo: { lte: weekNo },
          maturityWeekNo: { gte: weekNo },
        },
        include: {
          holding: {
            include: {
              studentProfile: {
                include: {
                  wallet: true,
                },
              },
            },
          },
        },
      });

      for (const bond of bonds) {
        const elapsed = weekNo - bond.startWeekNo;
        if (elapsed < 0) {
          continue;
        }

        if (elapsed % bond.couponIntervalWeeks !== 0) {
          continue;
        }

        const already = await tx.bondCouponPayout.findFirst({
          where: {
            bondPositionId: bond.id,
            weekNo,
          },
          select: { id: true },
        });

        if (already) {
          continue;
        }

        const couponAmount =
          this.core.toNumber(bond.faceValue) *
          this.core.toNumber(bond.couponRate);

        await tx.bondCouponPayout.create({
          data: {
            bondPositionId: bond.id,
            weekNo,
            amount: couponAmount,
          },
        });

        if (bond.holding.studentProfile.wallet) {
          const walletBalance = this.core.toNumber(
            bond.holding.studentProfile.wallet.balance,
          );
          await tx.wallet.update({
            where: { id: bond.holding.studentProfile.wallet.id },
            data: {
              balance: walletBalance + couponAmount,
            },
          });
        }

        couponCount += 1;
      }
    });

    return {
      success: true,
      data: {
        weekNo,
        dividendCount,
        couponCount,
      },
    };
  }
}
