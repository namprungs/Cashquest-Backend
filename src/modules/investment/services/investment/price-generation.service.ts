import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PriceGenerationType,
  ProductType,
  TermEventStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { toNumber } from 'src/common/utils/number.utils';
import { FinalizeLiveWeekDto } from '../../dto/finalize-live-week.dto';
import { GenerateLiveTicksDto } from '../../dto/generate-live-ticks.dto';
import { GenerateRangePriceDto } from '../../dto/generate-range-price.dto';
import { GenerateWeekPriceDto } from '../../dto/generate-week-price.dto';
import { ManualProductPricesDto } from '../../dto/manual-product-prices.dto';
import { InvestmentCoreService, TxClient } from './investment-core.service';

@Injectable()
export class PriceGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
  ) {}

  private isBondSimulation(sim: {
    model?: string | null;
    product?: { type?: ProductType | null } | null;
  }) {
    return (
      sim.product?.type === ProductType.BOND ||
      sim.model?.toUpperCase?.() === 'VASICEK'
    );
  }

  private stepBond(
    sim: {
      kappa?: unknown;
      theta?: unknown;
      sigmaYield?: unknown;
      modifiedDuration?: unknown;
      yieldFloor?: unknown;
    },
    currentYield: number,
    currentPrice: number,
    dt: number,
    randomShock: number,
    sigmaAdjustment = 0,
    sigmaMultiplier = 1,
  ) {
    const kappa = toNumber(sim.kappa);
    const theta = toNumber(sim.theta);
    const baseSigmaYield = toNumber(sim.sigmaYield);
    const modifiedDuration = toNumber(sim.modifiedDuration);
    const yieldFloor = toNumber(sim.yieldFloor) || 0.001;
    const sigmaYield = Math.max(
      0.000001,
      (baseSigmaYield + sigmaAdjustment) * sigmaMultiplier,
    );
    const dy =
      kappa * (theta - currentYield) * dt +
      sigmaYield * Math.sqrt(dt) * randomShock;
    const newYield = Math.max(yieldFloor, currentYield + dy);
    const priceChange = -modifiedDuration * (newYield - currentYield);
    const newPrice = Math.max(0.0001, currentPrice * (1 + priceChange));

    return {
      newYield,
      newPrice,
      sigmaYield,
      returnPct:
        currentPrice === 0 ? 0 : (newPrice - currentPrice) / currentPrice,
    };
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
              type: true,
              symbol: true,
              sector: true,
              riskLevel: true,
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
        (sum, regime) => sum + toNumber(regime.muAdjustment),
        0,
      );
      const regimeSigmaAdj = regimes.reduce(
        (sum, regime) => sum + toNumber(regime.sigmaAdjustment),
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
          select: { close: true, yieldClose: true },
        });

        const previousPrice = toNumber(
          previousTick?.price ?? previousClosePrice?.close ?? sim.initialPrice,
        );

        const applicableEvents = activeEvents.filter((eventItem) => {
          const impact =
            eventItem.customImpact ?? eventItem.event.defaultImpact;
          return this.core.eventAppliesToProduct(impact, sim.product);
        });

        const eventAdjustments = applicableEvents.reduce(
          (acc, eventItem) => {
            const impact =
              eventItem.customImpact ?? eventItem.event.defaultImpact;
            const next = this.core.resolveEventAdjustments(impact, sim.product);
            return {
              muAdjustment: acc.muAdjustment + next.muAdjustment,
              sigmaAdjustment: acc.sigmaAdjustment + next.sigmaAdjustment,
              sigmaMultiplier: acc.sigmaMultiplier * next.sigmaMultiplier,
            };
          },
          { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 },
        );

        const dtPerTick = Math.max(
          0.000000001,
          toNumber(sim.dt) / ticksPerWeek,
        );
        const randomShock = this.core.gaussianRandom();

        let muUsed =
          toNumber(sim.mu) + eventAdjustments.muAdjustment + regimeMuAdj;
        let sigmaUsed =
          toNumber(sim.sigma) +
          eventAdjustments.sigmaAdjustment +
          regimeSigmaAdj;
        let price: number;
        let returnPct: number;
        let yieldValue: number | undefined;

        if (this.isBondSimulation(sim)) {
          const previousYield = toNumber(
            previousTick?.yieldValue ??
              previousClosePrice?.yieldClose ??
              sim.initialYield,
          );
          const stepped = this.stepBond(
            sim,
            previousYield,
            previousPrice,
            dtPerTick,
            randomShock,
            eventAdjustments.sigmaAdjustment + regimeSigmaAdj,
            eventAdjustments.sigmaMultiplier,
          );
          price = stepped.newPrice;
          returnPct = stepped.returnPct;
          yieldValue = stepped.newYield;
          muUsed = toNumber(sim.kappa);
          sigmaUsed = stepped.sigmaYield;
        } else {
          sigmaUsed *= eventAdjustments.sigmaMultiplier;
          sigmaUsed = Math.max(0.000001, sigmaUsed);
          const drift = (muUsed - 0.5 * sigmaUsed * sigmaUsed) * dtPerTick;
          const diffusion = sigmaUsed * Math.sqrt(dtPerTick) * randomShock;
          price = Math.max(0.0001, previousPrice * Math.exp(drift + diffusion));
          returnPct =
            previousPrice === 0 ? 0 : (price - previousPrice) / previousPrice;
        }

        const row = await tx.productLivePriceTick.create({
          data: {
            termId,
            productId: sim.productId,
            simulatedWeekNo: weekNo,
            price,
            returnPct,
            muUsed,
            sigmaUsed,
            yieldValue,
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

  async applyImmediateEventShock(termId: string, termEventId: string) {
    await this.core.assertTermExists(termId);

    const weekNo = await this.core.getCurrentWeek(termId);

    const data = await this.prisma.$transaction(async (tx) => {
      const termEvent = await tx.termEvent.findFirst({
        where: {
          id: termEventId,
          termId,
        },
        include: { event: true },
      });

      if (!termEvent) {
        throw new NotFoundException('Term event not found');
      }

      if ((termEvent as any).applyMode !== 'IMMEDIATE') {
        return [];
      }

      if (termEvent.status !== TermEventStatus.ACTIVE) {
        return [];
      }

      if (termEvent.startWeek > weekNo || termEvent.endWeek < weekNo) {
        return [];
      }

      const impact = termEvent.customImpact ?? termEvent.event.defaultImpact;

      const simulations = await tx.productSimulation.findMany({
        where: { termId },
        include: {
          product: {
            select: {
              type: true,
              symbol: true,
              sector: true,
              riskLevel: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const createdTicks: Array<
        Awaited<ReturnType<typeof tx.productLivePriceTick.create>>
      > = [];

      for (const sim of simulations) {
        if (!this.core.eventAppliesToProduct(impact, sim.product)) {
          continue;
        }

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
            weekNo: { lte: weekNo },
          },
          orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
          select: { close: true },
        });

        const previousPrice = toNumber(
          previousTick?.price ?? previousClosePrice?.close ?? sim.initialPrice,
        );

        if (previousPrice <= 0) {
          continue;
        }

        const impactRecord =
          impact && typeof impact === 'object' && !Array.isArray(impact)
            ? (impact as Record<string, unknown>)
            : {};

        const shockPct =
          toNumber(impactRecord.instantShockPct) ||
          toNumber(impactRecord.immediateShockPct) ||
          toNumber(impactRecord.priceShockPct) ||
          toNumber(impactRecord.shockPct) ||
          0;

        const nextPrice = Math.max(0.0001, previousPrice * (1 + shockPct));
        const returnPct = (nextPrice - previousPrice) / previousPrice;

        const eventAdjustments = this.core.resolveEventAdjustments(
          impact,
          sim.product,
        );
        const muUsed = toNumber(sim.mu) + eventAdjustments.muAdjustment;
        const sigmaUsed = Math.max(
          0.000001,
          (toNumber(sim.sigma) + eventAdjustments.sigmaAdjustment) *
            eventAdjustments.sigmaMultiplier,
        );

        const tick = await tx.productLivePriceTick.create({
          data: {
            termId,
            productId: sim.productId,
            simulatedWeekNo: weekNo,
            price: nextPrice,
            returnPct,
            muUsed,
            sigmaUsed,
            eventId: termEvent.eventId,
            generationType: PriceGenerationType.LIVE_TICK,
          },
        });

        createdTicks.push(tick);
      }

      return createdTicks;
    });

    return {
      success: true,
      data,
      meta: {
        weekNo,
        termEventId,
      },
    };
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

        let high = toNumber(first.price);
        let low = toNumber(first.price);

        for (const tick of ticks) {
          const value = toNumber(tick.price);
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

        const previousClose = toNumber(previous?.close ?? sim.initialPrice);
        const close = toNumber(last.price);
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
            open: toNumber(first.price),
            high,
            low,
            close,
            returnPct,
            muUsed: toNumber(last.muUsed),
            sigmaUsed: toNumber(last.sigmaUsed),
            yieldOpen: first.yieldValue,
            yieldClose: last.yieldValue,
            eventId: last.eventId,
            generationType: PriceGenerationType.LIVE_FINALIZED,
          },
          create: {
            termId,
            productId: sim.productId,
            weekNo,
            open: toNumber(first.price),
            high,
            low,
            close,
            returnPct,
            muUsed: toNumber(last.muUsed),
            sigmaUsed: toNumber(last.sigmaUsed),
            yieldOpen: first.yieldValue,
            yieldClose: last.yieldValue,
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
            type: true,
            symbol: true,
            sector: true,
            riskLevel: true,
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
      (sum, regime) => sum + toNumber(regime.muAdjustment),
      0,
    );
    const regimeSigmaAdj = regimes.reduce(
      (sum, regime) => sum + toNumber(regime.sigmaAdjustment),
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

      const previousClose = toNumber(previous?.close ?? sim.initialPrice);

      const applicableEvents = activeEvents.filter((eventItem) => {
        const impact = eventItem.customImpact ?? eventItem.event.defaultImpact;
        return this.core.eventAppliesToProduct(impact, sim.product);
      });

      const eventAdjustments = applicableEvents.reduce(
        (acc, eventItem) => {
          const impact =
            eventItem.customImpact ?? eventItem.event.defaultImpact;
          const next = this.core.resolveEventAdjustments(impact, sim.product);
          return {
            muAdjustment: acc.muAdjustment + next.muAdjustment,
            sigmaAdjustment: acc.sigmaAdjustment + next.sigmaAdjustment,
            sigmaMultiplier: acc.sigmaMultiplier * next.sigmaMultiplier,
          };
        },
        { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 },
      );

      let muUsed =
        toNumber(sim.mu) + eventAdjustments.muAdjustment + regimeMuAdj;

      let sigmaUsed =
        toNumber(sim.sigma) + eventAdjustments.sigmaAdjustment + regimeSigmaAdj;
      const dt = toNumber(sim.dt);
      const randomShock = this.core.gaussianRandom();
      const open = previousClose;
      let close: number;
      let high: number;
      let low: number;
      let returnPct: number;
      let yieldOpen: number | undefined;
      let yieldClose: number | undefined;
      let generationType: PriceGenerationType =
        applicableEvents.length > 0
          ? PriceGenerationType.GBM_EVENT_ADJUSTED
          : PriceGenerationType.GBM;

      if (this.isBondSimulation(sim)) {
        yieldOpen = toNumber(previous?.yieldClose ?? sim.initialYield);
        const stepped = this.stepBond(
          sim,
          yieldOpen,
          previousClose,
          dt,
          randomShock,
          eventAdjustments.sigmaAdjustment + regimeSigmaAdj,
          eventAdjustments.sigmaMultiplier,
        );
        close = stepped.newPrice;
        yieldClose = stepped.newYield;
        returnPct = stepped.returnPct;
        sigmaUsed = stepped.sigmaYield;
        muUsed = toNumber(sim.kappa);
        const intradayWiggle =
          Math.abs(this.core.gaussianRandom()) *
          Math.max(
            0.0005,
            toNumber(sim.modifiedDuration) * sigmaUsed * Math.sqrt(dt) * 0.25,
          );
        high = Math.max(open, close) * (1 + intradayWiggle);
        low = Math.max(0.0001, Math.min(open, close) * (1 - intradayWiggle));
        generationType =
          applicableEvents.length > 0
            ? PriceGenerationType.VASICEK_EVENT_ADJUSTED
            : PriceGenerationType.VASICEK;
      } else {
        sigmaUsed *= eventAdjustments.sigmaMultiplier;
        sigmaUsed = Math.max(0.000001, sigmaUsed);
        const drift = (muUsed - 0.5 * sigmaUsed * sigmaUsed) * dt;
        const diffusion = sigmaUsed * Math.sqrt(dt) * randomShock;
        close = Math.max(0.0001, previousClose * Math.exp(drift + diffusion));
        high =
          Math.max(open, close) *
          (1 + Math.abs(this.core.gaussianRandom()) * 0.01);
        low =
          Math.min(open, close) *
          (1 - Math.abs(this.core.gaussianRandom()) * 0.01);
        returnPct =
          previousClose === 0 ? 0 : (close - previousClose) / previousClose;
      }

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
          yieldOpen,
          yieldClose,
          eventId: firstActiveEvent?.id,
          generationType,
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
          yieldOpen,
          yieldClose,
          eventId: firstActiveEvent?.id,
          generationType,
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
