import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PriceGenerationType, TermEventStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinalizeLiveWeekDto } from '../../dto/finalize-live-week.dto';
import { GenerateLiveTicksDto } from '../../dto/generate-live-ticks.dto';
import { GenerateRangePriceDto } from '../../dto/generate-range-price.dto';
import { GenerateWeekPriceDto } from '../../dto/generate-week-price.dto';
import { ListLivePriceTicksQueryDto } from '../../dto/list-live-price-ticks-query.dto';
import { ListProductPricesQueryDto } from '../../dto/list-product-prices-query.dto';
import { ManualProductPricesDto } from '../../dto/manual-product-prices.dto';
import { InvestmentCoreService, TxClient } from './investment-core.service';

@Injectable()
export class InvestmentMarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
  ) {}

  async listProducts(termId: string) {
    await this.core.assertTermExists(termId);

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
    await this.core.assertTermExists(termId);

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
    await this.core.assertTermExists(termId);

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

    const simulatedWeekNo =
      query.weekNo ?? (await this.core.getCurrentWeek(termId));
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
    await this.core.assertTermExists(termId);
    const weekNo = dto.weekNo ?? (await this.core.getCurrentWeek(termId));
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
        (sum, regime) => sum + this.core.toNumber(regime.muAdjustment),
        0,
      );
      const regimeSigmaAdj = regimes.reduce(
        (sum, regime) => sum + this.core.toNumber(regime.sigmaAdjustment),
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

        const previousPrice = this.core.toNumber(
          previousTick?.price ?? previousClosePrice?.close ?? sim.initialPrice,
        );

        const applicableEvents = activeEvents.filter((eventItem) => {
          const impact =
            eventItem.customImpact ?? eventItem.event.defaultImpact;
          return this.core.eventAppliesToProduct(impact, sim.product?.sector);
        });

        const eventAdjustments = applicableEvents.reduce(
          (acc, eventItem) => {
            const impact =
              eventItem.customImpact ?? eventItem.event.defaultImpact;
            const next = this.core.resolveEventAdjustments(impact);
            return {
              muAdjustment: acc.muAdjustment + next.muAdjustment,
              sigmaAdjustment: acc.sigmaAdjustment + next.sigmaAdjustment,
              sigmaMultiplier: acc.sigmaMultiplier * next.sigmaMultiplier,
            };
          },
          { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 },
        );

        const muUsed =
          this.core.toNumber(sim.mu) +
          eventAdjustments.muAdjustment +
          regimeMuAdj;

        let sigmaUsed =
          this.core.toNumber(sim.sigma) +
          eventAdjustments.sigmaAdjustment +
          regimeSigmaAdj;
        sigmaUsed *= eventAdjustments.sigmaMultiplier;
        sigmaUsed = Math.max(0.000001, sigmaUsed);

        const dtPerTick = Math.max(
          0.000000001,
          this.core.toNumber(sim.dt) / ticksPerWeek,
        );
        const randomShock = this.core.gaussianRandom();
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
    await this.core.assertTermExists(termId);

    const weekNo = dto.weekNo ?? (await this.core.getCurrentWeek(termId));

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

        let high = this.core.toNumber(first.price);
        let low = this.core.toNumber(first.price);

        for (const tick of ticks) {
          const value = this.core.toNumber(tick.price);
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

        const previousClose = this.core.toNumber(
          previous?.close ?? sim.initialPrice,
        );
        const close = this.core.toNumber(last.price);
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
            open: this.core.toNumber(first.price),
            high,
            low,
            close,
            returnPct,
            muUsed: this.core.toNumber(last.muUsed),
            sigmaUsed: this.core.toNumber(last.sigmaUsed),
            eventId: last.eventId,
            generationType: PriceGenerationType.LIVE_FINALIZED,
          },
          create: {
            termId,
            productId: sim.productId,
            weekNo,
            open: this.core.toNumber(first.price),
            high,
            low,
            close,
            returnPct,
            muUsed: this.core.toNumber(last.muUsed),
            sigmaUsed: this.core.toNumber(last.sigmaUsed),
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
      (sum, regime) => sum + this.core.toNumber(regime.muAdjustment),
      0,
    );
    const regimeSigmaAdj = regimes.reduce(
      (sum, regime) => sum + this.core.toNumber(regime.sigmaAdjustment),
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

      const previousClose = this.core.toNumber(
        previous?.close ?? sim.initialPrice,
      );

      const applicableEvents = activeEvents.filter((eventItem) => {
        const impact = eventItem.customImpact ?? eventItem.event.defaultImpact;
        return this.core.eventAppliesToProduct(impact, sim.product?.sector);
      });

      const eventAdjustments = applicableEvents.reduce(
        (acc, eventItem) => {
          const impact =
            eventItem.customImpact ?? eventItem.event.defaultImpact;
          const next = this.core.resolveEventAdjustments(impact);
          return {
            muAdjustment: acc.muAdjustment + next.muAdjustment,
            sigmaAdjustment: acc.sigmaAdjustment + next.sigmaAdjustment,
            sigmaMultiplier: acc.sigmaMultiplier * next.sigmaMultiplier,
          };
        },
        { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 },
      );

      const muUsed =
        this.core.toNumber(sim.mu) +
        eventAdjustments.muAdjustment +
        regimeMuAdj;

      let sigmaUsed =
        this.core.toNumber(sim.sigma) +
        eventAdjustments.sigmaAdjustment +
        regimeSigmaAdj;
      sigmaUsed *= eventAdjustments.sigmaMultiplier;
      sigmaUsed = Math.max(0.000001, sigmaUsed);

      const dt = this.core.toNumber(sim.dt);
      const randomShock = this.core.gaussianRandom();
      const drift = (muUsed - 0.5 * sigmaUsed * sigmaUsed) * dt;
      const diffusion = sigmaUsed * Math.sqrt(dt) * randomShock;

      const close = Math.max(
        0.0001,
        previousClose * Math.exp(drift + diffusion),
      );
      const open = previousClose;
      const high =
        Math.max(open, close) *
        (1 + Math.abs(this.core.gaussianRandom()) * 0.01);
      const low =
        Math.min(open, close) *
        (1 - Math.abs(this.core.gaussianRandom()) * 0.01);
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
    await this.core.assertTermExists(termId);
    const weekNo = dto.weekNo ?? (await this.core.getCurrentWeek(termId));

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
    await this.core.assertTermExists(termId);

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
    await this.core.assertTermExists(termId);

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
}
