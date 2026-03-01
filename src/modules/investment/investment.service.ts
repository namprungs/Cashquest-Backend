import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BondPositionStatus,
  OrderSide,
  OrderStatus,
  OrderType,
  PriceGenerationType,
  ProductType,
  TermEventStatus,
  Prisma,
  type User,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListProductPricesQueryDto } from './dto/list-product-prices-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListMyOrdersQueryDto } from './dto/list-my-orders-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpsertProductSimulationsDto } from './dto/upsert-product-simulations.dto';
import { UpsertTermSimulationDto } from './dto/upsert-term-simulation.dto';
import { GenerateWeekPriceDto } from './dto/generate-week-price.dto';
import { GenerateRangePriceDto } from './dto/generate-range-price.dto';
import { ManualProductPricesDto } from './dto/manual-product-prices.dto';
import { CreateEconomicEventDto } from './dto/create-economic-event.dto';
import { UpdateEconomicEventDto } from './dto/update-economic-event.dto';
import { CreateTermEventDto } from './dto/create-term-event.dto';
import { UpdateTermEventDto } from './dto/update-term-event.dto';
import { CreateMarketRegimeDto } from './dto/create-market-regime.dto';
import { UpdateMarketRegimeDto } from './dto/update-market-regime.dto';
import { ProcessOrdersDto } from './dto/process-orders.dto';
import { ProcessPayoutsDto } from './dto/process-payouts.dto';
import { ListLivePriceTicksQueryDto } from './dto/list-live-price-ticks-query.dto';
import { GenerateLiveTicksDto } from './dto/generate-live-ticks.dto';
import { FinalizeLiveWeekDto } from './dto/finalize-live-week.dto';

type CurrentUser = User & { role?: { name?: string } | null };

type TxClient = Prisma.TransactionClient;

@Injectable()
export class InvestmentService {
  constructor(private readonly prisma: PrismaService) {}

  private assertTeacherOrAdmin(user: CurrentUser) {
    const roleName = user?.role?.name?.toUpperCase?.();
    if (!roleName || !['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      throw new ForbiddenException(
        'Only teacher/admin can perform this action',
      );
    }
  }

  private assertStudent(user: CurrentUser) {
    const roleName = user?.role?.name?.toUpperCase?.();
    if (!roleName || roleName !== 'STUDENT') {
      throw new ForbiddenException('Only student can perform this action');
    }
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return Number(value);
  }

  private toInputJson(
    value: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value as Prisma.InputJsonValue;
  }

  private async assertTermExists(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }
  }

  private async getStudentProfileOrThrow(userId: string, termId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId,
          termId,
        },
      },
      select: {
        id: true,
        userId: true,
        wallet: {
          select: {
            id: true,
            balance: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Student profile for this term not found');
    }

    return profile;
  }

  private async getCurrentWeek(
    termId: string,
    tx: PrismaService | TxClient = this.prisma,
  ) {
    const simulation = await tx.termSimulation.findUnique({
      where: { termId },
      select: { currentWeek: true },
    });
    return simulation?.currentWeek ?? 1;
  }

  private gaussianRandom() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  private resolveEventAdjustments(impact: unknown) {
    if (!impact || typeof impact !== 'object' || Array.isArray(impact)) {
      return { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 };
    }

    const data = impact as Record<string, unknown>;

    const muAdjustment =
      this.toNumber(data.muAdjustment) ||
      this.toNumber(data.driftShift) ||
      this.toNumber(data.muShift) ||
      0;

    const sigmaAdjustment =
      this.toNumber(data.sigmaAdjustment) ||
      this.toNumber(data.volatilityShift) ||
      0;

    const sigmaMultiplier =
      this.toNumber(data.sigmaMultiplier) ||
      this.toNumber(data.volatilityMultiplier) ||
      1;

    return {
      muAdjustment,
      sigmaAdjustment,
      sigmaMultiplier: sigmaMultiplier <= 0 ? 1 : sigmaMultiplier,
    };
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item).trim().toUpperCase())
        .filter((item) => item.length > 0);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => item.length > 0);
    }

    return [];
  }

  private eventAppliesToProduct(impact: unknown, sector?: string | null) {
    if (!impact || typeof impact !== 'object' || Array.isArray(impact)) {
      return true;
    }

    const data = impact as Record<string, unknown>;
    const targetSectors = this.normalizeStringArray(
      data.targetSectors ?? data.sectors ?? data.targetSector,
    );
    const excludeSectors = this.normalizeStringArray(
      data.excludeSectors ?? data.excludedSectors,
    );

    if (!targetSectors.length && !excludeSectors.length) {
      return true;
    }

    const normalizedSector = (sector ?? '').trim().toUpperCase();
    if (!normalizedSector) {
      return false;
    }

    if (targetSectors.length && !targetSectors.includes(normalizedSector)) {
      return false;
    }

    if (excludeSectors.includes(normalizedSector)) {
      return false;
    }

    return true;
  }

  async listProducts(termId: string) {
    await this.assertTermExists(termId);

    const simulations = await this.prisma.productSimulation.findMany({
      where: { termId },
      include: {
        product: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const productIds = simulations.map((s) => s.productId);

    const latestPrices = productIds.length
      ? await this.prisma.productPrice.findMany({
          where: {
            termId,
            productId: { in: productIds },
          },
          orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
        })
      : [];

    const latestPriceByProduct = new Map<
      string,
      (typeof latestPrices)[number]
    >();
    for (const price of latestPrices) {
      if (!latestPriceByProduct.has(price.productId)) {
        latestPriceByProduct.set(price.productId, price);
      }
    }

    const data = simulations.map((sim) => ({
      ...sim.product,
      simulation: {
        initialPrice: sim.initialPrice,
        mu: sim.mu,
        sigma: sim.sigma,
        dt: sim.dt,
      },
      latestPrice: latestPriceByProduct.get(sim.productId) ?? null,
    }));

    return { success: true, data };
  }

  async listProductPrices(
    termId: string,
    productId: string,
    query: ListProductPricesQueryDto,
  ) {
    await this.assertTermExists(termId);

    const simulation = await this.prisma.productSimulation.findUnique({
      where: {
        termId_productId: {
          termId,
          productId,
        },
      },
      select: { id: true },
    });

    if (!simulation) {
      throw new NotFoundException('Product simulation in this term not found');
    }

    const rangeToPoints: Record<
      NonNullable<ListProductPricesQueryDto['range']>,
      number
    > = {
      '1d': 1,
      '5d': 5,
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '12m': 365,
    };

    let fromWeek = query.fromWeek;
    let toWeek = query.toWeek;

    if (query.range) {
      const points = rangeToPoints[query.range];
      const latestWeekResult = await this.prisma.productPrice.aggregate({
        where: {
          termId,
          productId,
        },
        _max: {
          weekNo: true,
        },
      });

      const latestWeek = latestWeekResult._max.weekNo;
      if (!latestWeek) {
        return { success: true, data: [] };
      }

      toWeek = toWeek ?? latestWeek;
      fromWeek = Math.max(1, toWeek - points + 1);
    }

    if (fromWeek !== undefined && toWeek !== undefined && fromWeek > toWeek) {
      throw new BadRequestException(
        'fromWeek must be less than or equal to toWeek',
      );
    }

    const prices = await this.prisma.productPrice.findMany({
      where: {
        termId,
        productId,
        ...(fromWeek !== undefined || toWeek !== undefined
          ? {
              weekNo: {
                ...(fromWeek !== undefined ? { gte: fromWeek } : {}),
                ...(toWeek !== undefined ? { lte: toWeek } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ weekNo: 'asc' }],
    });

    return { success: true, data: prices };
  }

  async listLivePriceTicks(
    termId: string,
    productId: string,
    query: ListLivePriceTicksQueryDto,
  ) {
    await this.assertTermExists(termId);

    const simulation = await this.prisma.productSimulation.findUnique({
      where: {
        termId_productId: {
          termId,
          productId,
        },
      },
      select: { id: true },
    });

    if (!simulation) {
      throw new NotFoundException('Product simulation in this term not found');
    }

    const simulatedWeekNo = query.weekNo ?? (await this.getCurrentWeek(termId));
    const since =
      query.minutes !== undefined
        ? new Date(Date.now() - query.minutes * 60 * 1000)
        : undefined;

    let data;
    if (query.limit !== undefined) {
      const latest = await this.prisma.productLivePriceTick.findMany({
        where: {
          termId,
          productId,
          simulatedWeekNo,
          ...(since ? { tickedAt: { gte: since } } : {}),
        },
        orderBy: [{ tickedAt: 'desc' }],
        take: query.limit,
      });
      data = latest.reverse();
    } else {
      data = await this.prisma.productLivePriceTick.findMany({
        where: {
          termId,
          productId,
          simulatedWeekNo,
          ...(since ? { tickedAt: { gte: since } } : {}),
        },
        orderBy: [{ tickedAt: 'asc' }],
      });
    }

    return { success: true, data, meta: { simulatedWeekNo } };
  }

  async generateLiveTicks(termId: string, dto: GenerateLiveTicksDto) {
    await this.assertTermExists(termId);
    const weekNo = dto.weekNo ?? (await this.getCurrentWeek(termId));
    const ticksPerWeek = dto.ticksPerWeek ?? 10080;

    const data = await this.prisma.$transaction(async (tx) => {
      const simulations = await tx.productSimulation.findMany({
        where: {
          termId,
          ...(dto.productIds?.length
            ? { productId: { in: dto.productIds } }
            : {}),
        },
        include: {
          product: {
            select: {
              sector: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!simulations.length) {
        throw new BadRequestException(
          'No product simulations found for this term',
        );
      }

      const activeEvents = await tx.termEvent.findMany({
        where: {
          termId,
          startWeek: { lte: weekNo },
          endWeek: { gte: weekNo },
          status: {
            in: [TermEventStatus.SCHEDULED, TermEventStatus.ACTIVE],
          },
        },
        include: { event: true },
        orderBy: [{ startWeek: 'asc' }],
      });

      const regimes = await tx.marketRegime.findMany({
        where: {
          termId,
          startWeek: { lte: weekNo },
          endWeek: { gte: weekNo },
        },
      });

      const regimeMuAdj = regimes.reduce(
        (sum, regime) => sum + this.toNumber(regime.muAdjustment),
        0,
      );
      const regimeSigmaAdj = regimes.reduce(
        (sum, regime) => sum + this.toNumber(regime.sigmaAdjustment),
        0,
      );

      const rows: Array<
        Awaited<ReturnType<typeof tx.productLivePriceTick.create>>
      > = [];

      for (const sim of simulations) {
        const previousTick = await tx.productLivePriceTick.findFirst({
          where: {
            termId,
            productId: sim.productId,
            simulatedWeekNo: weekNo,
          },
          orderBy: [{ tickedAt: 'desc' }],
        });

        const previousClosePrice = await tx.productPrice.findFirst({
          where: {
            termId,
            productId: sim.productId,
            weekNo: { lt: weekNo },
          },
          orderBy: [{ weekNo: 'desc' }],
          select: { close: true },
        });

        const previousPrice = this.toNumber(
          previousTick?.price ?? previousClosePrice?.close ?? sim.initialPrice,
        );

        const applicableEvents = activeEvents.filter((eventItem) => {
          const impact =
            eventItem.customImpact ?? eventItem.event.defaultImpact;
          return this.eventAppliesToProduct(impact, sim.product?.sector);
        });

        const eventAdjustments = applicableEvents.reduce(
          (acc, eventItem) => {
            const impact =
              eventItem.customImpact ?? eventItem.event.defaultImpact;
            const next = this.resolveEventAdjustments(impact);
            return {
              muAdjustment: acc.muAdjustment + next.muAdjustment,
              sigmaAdjustment: acc.sigmaAdjustment + next.sigmaAdjustment,
              sigmaMultiplier: acc.sigmaMultiplier * next.sigmaMultiplier,
            };
          },
          { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 },
        );

        const muUsed =
          this.toNumber(sim.mu) + eventAdjustments.muAdjustment + regimeMuAdj;

        let sigmaUsed =
          this.toNumber(sim.sigma) +
          eventAdjustments.sigmaAdjustment +
          regimeSigmaAdj;
        sigmaUsed *= eventAdjustments.sigmaMultiplier;
        sigmaUsed = Math.max(0.000001, sigmaUsed);

        const dtPerTick = Math.max(
          0.000000001,
          this.toNumber(sim.dt) / ticksPerWeek,
        );
        const randomShock = this.gaussianRandom();
        const drift = (muUsed - 0.5 * sigmaUsed * sigmaUsed) * dtPerTick;
        const diffusion = sigmaUsed * Math.sqrt(dtPerTick) * randomShock;

        const price = Math.max(
          0.0001,
          previousPrice * Math.exp(drift + diffusion),
        );
        const returnPct =
          previousPrice === 0 ? 0 : (price - previousPrice) / previousPrice;

        const row = await tx.productLivePriceTick.create({
          data: {
            termId,
            productId: sim.productId,
            simulatedWeekNo: weekNo,
            price,
            returnPct,
            muUsed,
            sigmaUsed,
            eventId: applicableEvents[0]?.event.id,
            generationType: PriceGenerationType.LIVE_TICK,
          },
        });

        rows.push(row);
      }

      return rows;
    });

    return { success: true, data, meta: { weekNo, ticksPerWeek } };
  }

  async finalizeLiveWeek(termId: string, dto: FinalizeLiveWeekDto) {
    await this.assertTermExists(termId);

    const weekNo = dto.weekNo ?? (await this.getCurrentWeek(termId));

    const data = await this.prisma.$transaction(async (tx) => {
      const simulations = await tx.productSimulation.findMany({
        where: {
          termId,
          ...(dto.productIds?.length
            ? { productId: { in: dto.productIds } }
            : {}),
        },
        orderBy: { createdAt: 'asc' },
      });

      const finalized: Array<
        Awaited<ReturnType<typeof tx.productPrice.upsert>>
      > = [];

      for (const sim of simulations) {
        const ticks = await tx.productLivePriceTick.findMany({
          where: {
            termId,
            productId: sim.productId,
            simulatedWeekNo: weekNo,
          },
          orderBy: [{ tickedAt: 'asc' }],
        });

        if (!ticks.length) {
          continue;
        }

        const first = ticks[0];
        const last = ticks[ticks.length - 1];

        let high = this.toNumber(first.price);
        let low = this.toNumber(first.price);

        for (const tick of ticks) {
          const value = this.toNumber(tick.price);
          if (value > high) high = value;
          if (value < low) low = value;
        }

        const previous = await tx.productPrice.findFirst({
          where: {
            termId,
            productId: sim.productId,
            weekNo: { lt: weekNo },
          },
          orderBy: [{ weekNo: 'desc' }],
          select: { close: true },
        });

        const previousClose = this.toNumber(
          previous?.close ?? sim.initialPrice,
        );
        const close = this.toNumber(last.price);
        const returnPct =
          previousClose === 0 ? 0 : (close - previousClose) / previousClose;

        const row = await tx.productPrice.upsert({
          where: {
            termId_productId_weekNo: {
              termId,
              productId: sim.productId,
              weekNo,
            },
          },
          update: {
            open: this.toNumber(first.price),
            high,
            low,
            close,
            returnPct,
            muUsed: this.toNumber(last.muUsed),
            sigmaUsed: this.toNumber(last.sigmaUsed),
            eventId: last.eventId,
            generationType: PriceGenerationType.LIVE_FINALIZED,
          },
          create: {
            termId,
            productId: sim.productId,
            weekNo,
            open: this.toNumber(first.price),
            high,
            low,
            close,
            returnPct,
            muUsed: this.toNumber(last.muUsed),
            sigmaUsed: this.toNumber(last.sigmaUsed),
            eventId: last.eventId,
            generationType: PriceGenerationType.LIVE_FINALIZED,
          },
        });

        finalized.push(row);
      }

      if (dto.clearTicksAfterFinalize === true) {
        await tx.productLivePriceTick.deleteMany({
          where: {
            termId,
            simulatedWeekNo: weekNo,
            ...(dto.productIds?.length
              ? { productId: { in: dto.productIds } }
              : {}),
          },
        });
      }

      if (dto.moveCurrentWeekToNext !== false) {
        await tx.termSimulation.upsert({
          where: { termId },
          update: { currentWeek: weekNo + 1 },
          create: {
            termId,
            randomSeed: 0,
            currentWeek: weekNo + 1,
            engineVersion: 'v1',
          },
        });
      }

      return finalized;
    });

    return { success: true, data, meta: { weekNo } };
  }

  async getMyPortfolio(termId: string, user: CurrentUser) {
    this.assertStudent(user);

    const profile = await this.getStudentProfileOrThrow(user.id, termId);

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
      const units = this.toNumber(holding.units);
      const avgCost = this.toNumber(holding.avgCost);
      const latest = latestPriceByProduct.get(holding.productId);
      const lastPrice = this.toNumber(latest?.close ?? 0);

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

    const cash = this.toNumber(profile.wallet?.balance ?? 0);

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
    this.assertStudent(user);
    const profile = await this.getStudentProfileOrThrow(user.id, termId);

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
    this.assertStudent(user);

    if (dto.orderType === OrderType.LIMIT && dto.requestedPrice === undefined) {
      throw new BadRequestException(
        'requestedPrice is required for LIMIT order',
      );
    }

    if (dto.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    const profile = await this.getStudentProfileOrThrow(user.id, termId);

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

    const currentWeek = await this.getCurrentWeek(termId);

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

    const marketPrice = this.toNumber(latestPrice?.close ?? 0);

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
      const walletBalance = this.toNumber(profile.wallet.balance);
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
        const oldUnits = this.toNumber(holding.units);
        const oldAvg = this.toNumber(holding.avgCost);
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

      const oldUnits = this.toNumber(holding.units);
      if (oldUnits < params.quantity) {
        throw new BadRequestException('Insufficient units to sell');
      }

      const proceeds = amount - params.fee;
      const walletBalance = this.toNumber(profile.wallet.balance);
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
    this.assertStudent(user);

    const profile = await this.getStudentProfileOrThrow(user.id, termId);

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
    this.assertStudent(user);

    const profile = await this.getStudentProfileOrThrow(user.id, termId);

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
    this.assertStudent(user);

    const profile = await this.getStudentProfileOrThrow(user.id, termId);

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
    this.assertStudent(user);

    const profile = await this.getStudentProfileOrThrow(user.id, termId);

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

  async listActiveEvents(termId: string, weekNo?: string) {
    await this.assertTermExists(termId);
    const currentWeek = weekNo
      ? Number(weekNo)
      : await this.getCurrentWeek(termId);

    const data = await this.prisma.termEvent.findMany({
      where: {
        termId,
        startWeek: { lte: currentWeek },
        endWeek: { gte: currentWeek },
        status: {
          in: [TermEventStatus.SCHEDULED, TermEventStatus.ACTIVE],
        },
      },
      include: {
        event: true,
      },
      orderBy: [{ startWeek: 'asc' }, { createdAt: 'asc' }],
    });

    return { success: true, data, meta: { weekNo: currentWeek } };
  }

  async createProduct(termId: string, dto: CreateProductDto) {
    await this.assertTermExists(termId);

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          type: dto.type,
          symbol: dto.symbol,
          name: dto.name,
          riskLevel: dto.riskLevel,
          sector: dto.sector,
          metaJson: this.toInputJson(dto.metaJson),
          isActive: dto.isActive ?? true,
        },
      });

      if (dto.simulation) {
        await tx.productSimulation.create({
          data: {
            termId,
            productId: product.id,
            initialPrice: dto.simulation.initialPrice,
            mu: dto.simulation.mu,
            sigma: dto.simulation.sigma,
            dt: dto.simulation.dt,
          },
        });
      }

      return product;
    });

    return { success: true, data: created };
  }

  async updateProduct(productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.symbol !== undefined ? { symbol: dto.symbol } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.riskLevel ? { riskLevel: dto.riskLevel } : {}),
        ...(dto.sector !== undefined ? { sector: dto.sector } : {}),
        ...(dto.metaJson !== undefined
          ? { metaJson: this.toInputJson(dto.metaJson) }
          : {}),
      },
    });

    return { success: true, data: updated };
  }

  async setProductActive(productId: string, isActive: boolean) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        isActive,
      },
    });

    return { success: true, data: updated };
  }

  async upsertProductSimulations(
    termId: string,
    dto: UpsertProductSimulationsDto,
  ) {
    await this.assertTermExists(termId);

    const data = await this.prisma.$transaction(async (tx) => {
      const rows: Array<
        Awaited<ReturnType<typeof tx.productSimulation.upsert>>
      > = [];

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true },
        });

        if (!product) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }

        const simulation = await tx.productSimulation.upsert({
          where: {
            termId_productId: {
              termId,
              productId: item.productId,
            },
          },
          update: {
            initialPrice: item.initialPrice,
            mu: item.mu,
            sigma: item.sigma,
            dt: item.dt,
          },
          create: {
            termId,
            productId: item.productId,
            initialPrice: item.initialPrice,
            mu: item.mu,
            sigma: item.sigma,
            dt: item.dt,
          },
        });

        rows.push(simulation);
      }

      return rows;
    });

    return { success: true, data };
  }

  async upsertTermSimulation(termId: string, dto: UpsertTermSimulationDto) {
    await this.assertTermExists(termId);

    const data = await this.prisma.termSimulation.upsert({
      where: {
        termId,
      },
      update: {
        randomSeed: dto.randomSeed,
        currentWeek: dto.currentWeek,
        engineVersion: dto.engineVersion,
      },
      create: {
        termId,
        randomSeed: dto.randomSeed,
        currentWeek: dto.currentWeek,
        engineVersion: dto.engineVersion,
      },
    });

    return { success: true, data };
  }

  private async generateOneWeek(
    tx: TxClient,
    termId: string,
    weekNo: number,
    opts?: { selectedProductIds?: string[] },
  ) {
    const simulations = await tx.productSimulation.findMany({
      where: {
        termId,
        ...(opts?.selectedProductIds?.length
          ? { productId: { in: opts.selectedProductIds } }
          : {}),
      },
      include: {
        product: {
          select: {
            sector: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!simulations.length) {
      throw new BadRequestException(
        'No product simulations found for this term',
      );
    }

    const activeEvents = await tx.termEvent.findMany({
      where: {
        termId,
        startWeek: { lte: weekNo },
        endWeek: { gte: weekNo },
        status: {
          in: [TermEventStatus.SCHEDULED, TermEventStatus.ACTIVE],
        },
      },
      include: { event: true },
      orderBy: [{ startWeek: 'asc' }],
    });

    const regimes = await tx.marketRegime.findMany({
      where: {
        termId,
        startWeek: { lte: weekNo },
        endWeek: { gte: weekNo },
      },
    });

    const regimeMuAdj = regimes.reduce(
      (sum, regime) => sum + this.toNumber(regime.muAdjustment),
      0,
    );
    const regimeSigmaAdj = regimes.reduce(
      (sum, regime) => sum + this.toNumber(regime.sigmaAdjustment),
      0,
    );

    const result: Array<Awaited<ReturnType<typeof tx.productPrice.upsert>>> =
      [];

    for (const sim of simulations) {
      const previous = await tx.productPrice.findFirst({
        where: {
          termId,
          productId: sim.productId,
          weekNo: { lt: weekNo },
        },
        orderBy: [{ weekNo: 'desc' }],
      });

      const previousClose = this.toNumber(previous?.close ?? sim.initialPrice);

      const applicableEvents = activeEvents.filter((eventItem) => {
        const impact = eventItem.customImpact ?? eventItem.event.defaultImpact;
        return this.eventAppliesToProduct(impact, sim.product?.sector);
      });

      const eventAdjustments = applicableEvents.reduce(
        (acc, eventItem) => {
          const impact =
            eventItem.customImpact ?? eventItem.event.defaultImpact;
          const next = this.resolveEventAdjustments(impact);
          return {
            muAdjustment: acc.muAdjustment + next.muAdjustment,
            sigmaAdjustment: acc.sigmaAdjustment + next.sigmaAdjustment,
            sigmaMultiplier: acc.sigmaMultiplier * next.sigmaMultiplier,
          };
        },
        { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 },
      );

      const muUsed =
        this.toNumber(sim.mu) + eventAdjustments.muAdjustment + regimeMuAdj;

      let sigmaUsed =
        this.toNumber(sim.sigma) +
        eventAdjustments.sigmaAdjustment +
        regimeSigmaAdj;
      sigmaUsed *= eventAdjustments.sigmaMultiplier;
      sigmaUsed = Math.max(0.000001, sigmaUsed);

      const dt = this.toNumber(sim.dt);
      const randomShock = this.gaussianRandom();
      const drift = (muUsed - 0.5 * sigmaUsed * sigmaUsed) * dt;
      const diffusion = sigmaUsed * Math.sqrt(dt) * randomShock;

      const close = Math.max(
        0.0001,
        previousClose * Math.exp(drift + diffusion),
      );
      const open = previousClose;
      const high =
        Math.max(open, close) * (1 + Math.abs(this.gaussianRandom()) * 0.01);
      const low =
        Math.min(open, close) * (1 - Math.abs(this.gaussianRandom()) * 0.01);
      const returnPct =
        previousClose === 0 ? 0 : (close - previousClose) / previousClose;

      const firstActiveEvent = applicableEvents[0]?.event;

      const price = await tx.productPrice.upsert({
        where: {
          termId_productId_weekNo: {
            termId,
            productId: sim.productId,
            weekNo,
          },
        },
        update: {
          open,
          high,
          low,
          close,
          returnPct,
          muUsed,
          sigmaUsed,
          eventId: firstActiveEvent?.id,
          generationType:
            applicableEvents.length > 0
              ? PriceGenerationType.GBM_EVENT_ADJUSTED
              : PriceGenerationType.GBM,
        },
        create: {
          termId,
          productId: sim.productId,
          weekNo,
          open,
          high,
          low,
          close,
          returnPct,
          muUsed,
          sigmaUsed,
          eventId: firstActiveEvent?.id,
          generationType:
            applicableEvents.length > 0
              ? PriceGenerationType.GBM_EVENT_ADJUSTED
              : PriceGenerationType.GBM,
        },
      });

      result.push(price);
    }

    return result;
  }

  async generateWeekPrices(termId: string, dto: GenerateWeekPriceDto) {
    await this.assertTermExists(termId);
    const weekNo = dto.weekNo ?? (await this.getCurrentWeek(termId));

    const data = await this.prisma.$transaction(async (tx) => {
      const rows = await this.generateOneWeek(tx, termId, weekNo, {
        selectedProductIds: dto.productIds,
      });

      if (dto.moveCurrentWeekToNext === true) {
        await tx.termSimulation.upsert({
          where: { termId },
          update: { currentWeek: weekNo + 1 },
          create: {
            termId,
            randomSeed: 0,
            currentWeek: weekNo + 1,
            engineVersion: 'v1',
          },
        });
      }

      return rows;
    });

    return { success: true, data, meta: { weekNo } };
  }

  async generateRangePrices(termId: string, dto: GenerateRangePriceDto) {
    await this.assertTermExists(termId);

    if (dto.endWeek < dto.startWeek) {
      throw new BadRequestException(
        'endWeek must be greater than or equal to startWeek',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const allRows: Array<Awaited<ReturnType<typeof tx.productPrice.upsert>>> =
        [];

      for (let week = dto.startWeek; week <= dto.endWeek; week += 1) {
        const rows = await this.generateOneWeek(tx, termId, week, {
          selectedProductIds: dto.productIds,
        });
        allRows.push(...rows);
      }

      if (dto.moveCurrentWeekToNext === true) {
        await tx.termSimulation.upsert({
          where: { termId },
          update: { currentWeek: dto.endWeek + 1 },
          create: {
            termId,
            randomSeed: 0,
            currentWeek: dto.endWeek + 1,
            engineVersion: 'v1',
          },
        });
      }

      return allRows;
    });

    return {
      success: true,
      data,
      meta: { startWeek: dto.startWeek, endWeek: dto.endWeek },
    };
  }

  async manualUpsertPrices(termId: string, dto: ManualProductPricesDto) {
    await this.assertTermExists(termId);

    const data = await this.prisma.$transaction(async (tx) => {
      const rows: Array<Awaited<ReturnType<typeof tx.productPrice.upsert>>> =
        [];

      for (const item of dto.items) {
        const simulation = await tx.productSimulation.findUnique({
          where: {
            termId_productId: {
              termId,
              productId: item.productId,
            },
          },
          select: { id: true },
        });

        if (!simulation) {
          throw new NotFoundException(
            `Product ${item.productId} is not configured in this term`,
          );
        }

        const row = await tx.productPrice.upsert({
          where: {
            termId_productId_weekNo: {
              termId,
              productId: item.productId,
              weekNo: item.weekNo,
            },
          },
          update: {
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            returnPct: item.returnPct,
            muUsed: item.muUsed,
            sigmaUsed: item.sigmaUsed,
            eventId: item.eventId,
            generationType: PriceGenerationType.MANUAL,
          },
          create: {
            termId,
            productId: item.productId,
            weekNo: item.weekNo,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            returnPct: item.returnPct,
            muUsed: item.muUsed,
            sigmaUsed: item.sigmaUsed,
            eventId: item.eventId,
            generationType: PriceGenerationType.MANUAL,
          },
        });

        rows.push(row);
      }

      return rows;
    });

    return { success: true, data };
  }

  async createEconomicEvent(dto: CreateEconomicEventDto) {
    const data = await this.prisma.economicEvent.create({
      data: {
        title: dto.title,
        description: dto.description,
        eventType: dto.eventType,
        defaultImpact: this.toInputJson(dto.defaultImpact)!,
        isRepeatable: dto.isRepeatable ?? false,
      },
    });

    return { success: true, data };
  }

  async updateEconomicEvent(eventId: string, dto: UpdateEconomicEventDto) {
    const existing = await this.prisma.economicEvent.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Economic event not found');
    }

    const data = await this.prisma.economicEvent.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.eventType ? { eventType: dto.eventType } : {}),
        ...(dto.defaultImpact !== undefined
          ? { defaultImpact: this.toInputJson(dto.defaultImpact) }
          : {}),
        ...(dto.isRepeatable !== undefined
          ? { isRepeatable: dto.isRepeatable }
          : {}),
      },
    });

    return { success: true, data };
  }

  async createTermEvent(termId: string, dto: CreateTermEventDto) {
    await this.assertTermExists(termId);

    const event = await this.prisma.economicEvent.findUnique({
      where: { id: dto.eventId },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException('Economic event not found');
    }

    const data = await this.prisma.termEvent.create({
      data: {
        termId,
        eventId: dto.eventId,
        startWeek: dto.startWeek,
        endWeek: dto.endWeek,
        customImpact: this.toInputJson(dto.customImpact),
        status: dto.status ?? TermEventStatus.SCHEDULED,
      },
      include: { event: true },
    });

    return { success: true, data };
  }

  async updateTermEvent(
    termId: string,
    termEventId: string,
    dto: UpdateTermEventDto,
  ) {
    await this.assertTermExists(termId);

    const termEvent = await this.prisma.termEvent.findFirst({
      where: {
        id: termEventId,
        termId,
      },
      select: { id: true },
    });

    if (!termEvent) {
      throw new NotFoundException('Term event not found');
    }

    if (dto.eventId) {
      const event = await this.prisma.economicEvent.findUnique({
        where: { id: dto.eventId },
        select: { id: true },
      });
      if (!event) {
        throw new NotFoundException('Economic event not found');
      }
    }

    const data = await this.prisma.termEvent.update({
      where: { id: termEventId },
      data: {
        ...(dto.eventId ? { event: { connect: { id: dto.eventId } } } : {}),
        ...(dto.startWeek !== undefined ? { startWeek: dto.startWeek } : {}),
        ...(dto.endWeek !== undefined ? { endWeek: dto.endWeek } : {}),
        ...(dto.customImpact !== undefined
          ? { customImpact: this.toInputJson(dto.customImpact) }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: { event: true },
    });

    return { success: true, data };
  }

  async createRegime(termId: string, dto: CreateMarketRegimeDto) {
    await this.assertTermExists(termId);

    const data = await this.prisma.marketRegime.create({
      data: {
        termId,
        name: dto.name,
        muAdjustment: dto.muAdjustment,
        sigmaAdjustment: dto.sigmaAdjustment,
        startWeek: dto.startWeek,
        endWeek: dto.endWeek,
      },
    });

    return { success: true, data };
  }

  async updateRegime(
    termId: string,
    regimeId: string,
    dto: UpdateMarketRegimeDto,
  ) {
    await this.assertTermExists(termId);

    const existing = await this.prisma.marketRegime.findFirst({
      where: {
        id: regimeId,
        termId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Market regime not found');
    }

    const data = await this.prisma.marketRegime.update({
      where: { id: regimeId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.muAdjustment !== undefined
          ? { muAdjustment: dto.muAdjustment }
          : {}),
        ...(dto.sigmaAdjustment !== undefined
          ? { sigmaAdjustment: dto.sigmaAdjustment }
          : {}),
        ...(dto.startWeek !== undefined ? { startWeek: dto.startWeek } : {}),
        ...(dto.endWeek !== undefined ? { endWeek: dto.endWeek } : {}),
      },
    });

    return { success: true, data };
  }

  async processPendingOrders(termId: string, dto: ProcessOrdersDto) {
    await this.assertTermExists(termId);

    const weekNo = dto.weekNo ?? (await this.getCurrentWeek(termId));

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

        const marketPrice = this.toNumber(market?.close ?? 0);
        if (marketPrice <= 0) {
          continue;
        }

        const limitPrice = this.toNumber(order.requestedPrice);

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
            quantity: this.toNumber(order.quantity),
            fee: this.toNumber(order.fee),
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
    await this.assertTermExists(termId);

    const weekNo = dto.weekNo ?? (await this.getCurrentWeek(termId));
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
          const units = this.toNumber(holding.units);
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
            const walletBalance = this.toNumber(
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
          this.toNumber(bond.faceValue) * this.toNumber(bond.couponRate);

        await tx.bondCouponPayout.create({
          data: {
            bondPositionId: bond.id,
            weekNo,
            amount: couponAmount,
          },
        });

        if (bond.holding.studentProfile.wallet) {
          const walletBalance = this.toNumber(
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
