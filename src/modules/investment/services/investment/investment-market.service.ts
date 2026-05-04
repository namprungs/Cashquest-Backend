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
import { AppCacheService } from 'src/modules/cache/app-cache.service';
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
    private readonly cache: AppCacheService,
  ) {}

  private mapRiskLevel(riskLevel: string) {
    switch (riskLevel) {
      case 'LOW':
        return 'low';
      case 'MED':
        return 'medium';
      case 'HIGH':
        return 'high';
      default:
        return 'medium';
    }
  }

  private isBondSimulation(sim: {
    model?: string | null;
    product?: { type?: ProductType | null } | null;
  }) {
    return (
      sim.product?.type === ProductType.BOND ||
      sim.model?.toUpperCase?.() === 'VASICEK'
    );
  }

  private mapSimulation(sim: {
    initialPrice: unknown;
    model?: unknown;
    mu: unknown;
    sigma: unknown;
    dt: unknown;
    faceValue?: unknown;
    couponRate?: unknown;
    initialYield?: unknown;
    modifiedDuration?: unknown;
    kappa?: unknown;
    theta?: unknown;
    sigmaYield?: unknown;
    yieldFloor?: unknown;
  }) {
    return {
      initialPrice: sim.initialPrice,
      model: sim.model ?? 'GBM',
      mu: sim.mu,
      sigma: sim.sigma,
      dt: sim.dt,
      faceValue: sim.faceValue ?? null,
      couponRate: sim.couponRate ?? null,
      initialYield: sim.initialYield ?? null,
      modifiedDuration: sim.modifiedDuration ?? null,
      kappa: sim.kappa ?? null,
      theta: sim.theta ?? null,
      sigmaYield: sim.sigmaYield ?? null,
      yieldFloor: sim.yieldFloor ?? null,
    };
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
    const kappa = this.core.toNumber(sim.kappa);
    const theta = this.core.toNumber(sim.theta);
    const baseSigmaYield = this.core.toNumber(sim.sigmaYield);
    const modifiedDuration = this.core.toNumber(sim.modifiedDuration);
    const yieldFloor = this.core.toNumber(sim.yieldFloor) || 0.001;
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

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private getBondDisplayMeta(
    sim: {
      product?: {
        type?: ProductType | null;
        metaJson?: unknown;
        dividendPayoutIntervalWeeks?: number | null;
      } | null;
      couponRate?: unknown;
      modifiedDuration?: unknown;
    },
    term: {
      totalWeeks: number;
      endDate: Date;
      termWeeks: Array<{ weekNo: number; endDate: Date }>;
    },
  ) {
    if (!this.isBondSimulation(sim)) {
      return {};
    }

    const meta = this.asRecord(sim.product?.metaJson);
    const durationYears =
      this.core.toNumber(meta?.durationYears) ||
      this.core.toNumber(meta?.termYears) ||
      this.core.toNumber(sim.modifiedDuration);
    const configuredMaturityWeeks =
      this.core.toNumber(meta?.maturityWeeks) || term.totalWeeks;
    const maturityWeekNo = Math.max(
      1,
      Math.min(term.totalWeeks, Math.round(configuredMaturityWeeks)),
    );
    const maturityWeek = term.termWeeks.find(
      (week) => week.weekNo === maturityWeekNo,
    );
    const couponIntervalDays =
      this.core.toNumber(meta?.couponIntervalDays) || 2;

    const totalReturnRate =
      this.core.toNumber(meta?.totalReturnRate) || 0.70;

    return {
      durationYears,
      totalCouponReturnPercent: totalReturnRate * 100,
      maturityWeekNo,
      maturityDate: maturityWeek?.endDate ?? term.endDate,
      couponIntervalDays,
      couponIntervalLabel: `ทุก ${couponIntervalDays} วัน`,
    };
  }

  async listProducts(termId: string) {
    return this.cache.getOrSetCache(`market:products:${termId}`, 45, () =>
      this.fetchProducts(termId),
    );
  }

  private async fetchProducts(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: {
        totalWeeks: true,
        endDate: true,
        termWeeks: {
          select: {
            weekNo: true,
            endDate: true,
          },
          orderBy: { weekNo: 'asc' },
        },
      },
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }

    const currentWeek = await this.core.getCurrentWeek(termId);

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

    const data = await Promise.all(
      simulations.map(async (sim) => {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const currentWeekTicks =
          await this.prisma.productLivePriceTick.findMany({
            where: {
              termId,
              productId: sim.productId,
              simulatedWeekNo: currentWeek,
              tickedAt: { gte: oneDayAgo },
            },
            orderBy: [{ tickedAt: 'asc' }],
            take: 500,
          });

        const liveTicks = currentWeekTicks.length
          ? currentWeekTicks
          : (
              await this.prisma.productLivePriceTick.findMany({
                where: {
                  termId,
                  productId: sim.productId,
                },
                orderBy: [{ tickedAt: 'desc' }],
                take: 500,
              })
            ).reverse();

        let sparkline = liveTicks.map((tick) => this.core.toNumber(tick.price));

        const firstLiveTick = liveTicks[0] ?? null;
        const latestLiveTick = liveTicks[liveTicks.length - 1] ?? null;
        const closeReturnPct = this.core.toNumber(
          latestPriceByProduct.get(sim.productId)?.returnPct ?? 0,
        );
        const dayOpenPrice = this.core.toNumber(firstLiveTick?.price ?? 0);
        const liveTickPrice = this.core.toNumber(latestLiveTick?.price ?? 0);
        const liveReturnPct =
          dayOpenPrice > 0 && liveTickPrice > 0
            ? ((liveTickPrice - dayOpenPrice) / dayOpenPrice) * 100
            : closeReturnPct;

        if (!sparkline.length) {
          const fallbackPrices = await this.prisma.productPrice.findMany({
            where: {
              termId,
              productId: sim.productId,
            },
            orderBy: [{ weekNo: 'desc' }],
            take: 20,
          });

          sparkline = fallbackPrices
            .map((price) => this.core.toNumber(price.close))
            .reverse();
        }

        return {
          ...sim.product,
          risk: this.mapRiskLevel(sim.product.riskLevel),
          simulation: this.mapSimulation(sim),
          latestPrice: latestPriceByProduct.get(sim.productId) ?? null,
          liveTickPrice: latestLiveTick?.price ?? null,
          liveTickAt: latestLiveTick?.tickedAt ?? null,
          liveReturnPct,
          sparkline,
          ...this.getBondDisplayMeta(sim, term),
        };
      }),
    );

    return { success: true, data };
  }

  async getProductDetail(termId: string, productId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: {
        totalWeeks: true,
        endDate: true,
        termWeeks: {
          select: {
            weekNo: true,
            endDate: true,
          },
          orderBy: { weekNo: 'asc' },
        },
      },
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }

    const simulation = await this.prisma.productSimulation.findUnique({
      where: {
        termId_productId: {
          termId,
          productId,
        },
      },
      include: {
        product: true,
      },
    });

    if (!simulation) {
      throw new NotFoundException('Product simulation in this term not found');
    }

    const latestTwoPrices = await this.prisma.productPrice.findMany({
      where: {
        termId,
        productId,
      },
      orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
      take: 2,
    });

    const latestPrice = latestTwoPrices[0] ?? null;
    const previousPrice = latestTwoPrices[1] ?? null;
    const latestClose = this.core.toNumber(latestPrice?.close ?? 0);
    const previousClose = this.core.toNumber(previousPrice?.close ?? 0);

    const returnPct =
      previousClose > 0
        ? ((latestClose - previousClose) / previousClose) * 100
        : this.core.toNumber(latestPrice?.returnPct ?? 0);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayTicks = await this.prisma.productLivePriceTick.findMany({
      where: {
        termId,
        productId,
        tickedAt: { gte: oneDayAgo },
      },
      orderBy: [{ tickedAt: 'asc' }],
      take: 500,
    });

    const latestLiveTick = dayTicks[dayTicks.length - 1] ?? null;
    const firstLiveTick = dayTicks[0] ?? null;
    const dayOpenPrice = this.core.toNumber(firstLiveTick?.price ?? 0);
    const liveTickPrice = this.core.toNumber(latestLiveTick?.price ?? 0);
    const liveReturnPct =
      dayOpenPrice > 0 && liveTickPrice > 0
        ? ((liveTickPrice - dayOpenPrice) / dayOpenPrice) * 100
        : returnPct;

    if (!latestLiveTick) {
      const latestTickAny = await this.prisma.productLivePriceTick.findFirst({
        where: {
          termId,
          productId,
        },
        orderBy: [{ tickedAt: 'desc' }],
      });

      return {
        success: true,
        data: {
          ...simulation.product,
          risk: this.mapRiskLevel(simulation.product.riskLevel),
          simulation: this.mapSimulation(simulation),
          latestPrice,
          liveTickPrice: latestTickAny?.price ?? null,
          liveTickAt: latestTickAny?.tickedAt ?? null,
          liveReturnPct: returnPct,
          previousPrice,
          returnPct,
          ...this.getBondDisplayMeta(simulation, term),
        },
      };
    }

    return {
      success: true,
      data: {
        ...simulation.product,
        risk: this.mapRiskLevel(simulation.product.riskLevel),
        simulation: this.mapSimulation(simulation),
        latestPrice,
        liveTickPrice: latestLiveTick?.price ?? null,
        liveTickAt: latestLiveTick?.tickedAt ?? null,
        liveReturnPct,
        previousPrice,
        returnPct,
        ...this.getBondDisplayMeta(simulation, term),
      },
    };
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
        if (this.isBondSimulation(sim)) continue;

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

        const previousPrice = this.core.toNumber(
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
          this.core.toNumber(sim.dt) / ticksPerWeek,
        );
        const randomShock = this.core.gaussianRandom();

        let muUsed =
          this.core.toNumber(sim.mu) +
          eventAdjustments.muAdjustment +
          regimeMuAdj;
        let sigmaUsed =
          this.core.toNumber(sim.sigma) +
          eventAdjustments.sigmaAdjustment +
          regimeSigmaAdj;
        let price: number;
        let returnPct: number;
        let yieldValue: number | undefined;

        if (this.isBondSimulation(sim)) {
          const previousYield = this.core.toNumber(
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
          muUsed = this.core.toNumber(sim.kappa);
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

        const previousPrice = this.core.toNumber(
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
          this.core.toNumber(impactRecord.instantShockPct) ||
          this.core.toNumber(impactRecord.immediateShockPct) ||
          this.core.toNumber(impactRecord.priceShockPct) ||
          this.core.toNumber(impactRecord.shockPct) ||
          0;

        const nextPrice = Math.max(0.0001, previousPrice * (1 + shockPct));
        const returnPct = (nextPrice - previousPrice) / previousPrice;

        const eventAdjustments = this.core.resolveEventAdjustments(
          impact,
          sim.product,
        );
        const muUsed =
          this.core.toNumber(sim.mu) + eventAdjustments.muAdjustment;
        const sigmaUsed = Math.max(
          0.000001,
          (this.core.toNumber(sim.sigma) + eventAdjustments.sigmaAdjustment) *
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
            yieldOpen: first.yieldValue,
            yieldClose: last.yieldValue,
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
      if (this.isBondSimulation(sim)) continue;

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
        this.core.toNumber(sim.mu) +
        eventAdjustments.muAdjustment +
        regimeMuAdj;

      let sigmaUsed =
        this.core.toNumber(sim.sigma) +
        eventAdjustments.sigmaAdjustment +
        regimeSigmaAdj;
      const dt = this.core.toNumber(sim.dt);
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
        yieldOpen = this.core.toNumber(
          previous?.yieldClose ?? sim.initialYield,
        );
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
        muUsed = this.core.toNumber(sim.kappa);
        const intradayWiggle =
          Math.abs(this.core.gaussianRandom()) *
          Math.max(
            0.0005,
            this.core.toNumber(sim.modifiedDuration) *
              sigmaUsed *
              Math.sqrt(dt) *
              0.25,
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
