import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppCacheService } from 'src/modules/cache/app-cache.service';
import { toNumber } from 'src/common/utils/number.utils';
import { ListLivePriceTicksQueryDto } from '../../dto/list-live-price-ticks-query.dto';
import { ListProductPricesQueryDto } from '../../dto/list-product-prices-query.dto';
import { InvestmentCoreService } from './investment-core.service';

@Injectable()
export class ProductListingService {
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
      toNumber(meta?.durationYears) ||
      toNumber(meta?.termYears) ||
      toNumber(sim.modifiedDuration);
    const configuredMaturityWeeks =
      toNumber(meta?.maturityWeeks) || term.totalWeeks;
    const maturityWeekNo = Math.max(
      1,
      Math.min(term.totalWeeks, Math.round(configuredMaturityWeeks)),
    );
    const maturityWeek = term.termWeeks.find(
      (week) => week.weekNo === maturityWeekNo,
    );
    const couponIntervalWeeks =
      sim.product?.dividendPayoutIntervalWeeks &&
      sim.product.dividendPayoutIntervalWeeks > 0
        ? sim.product.dividendPayoutIntervalWeeks
        : 4;

    return {
      durationYears,
      totalCouponReturnPercent: toNumber(sim.couponRate) * 100 * durationYears,
      maturityWeekNo,
      maturityDate: maturityWeek?.endDate ?? term.endDate,
      couponIntervalWeeks,
      couponIntervalLabel: `ทุก ${couponIntervalWeeks} สัปดาห์`,
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

        let sparkline = liveTicks.map((tick) => toNumber(tick.price));

        const firstLiveTick = liveTicks[0] ?? null;
        const latestLiveTick = liveTicks[liveTicks.length - 1] ?? null;
        const closeReturnPct = toNumber(
          latestPriceByProduct.get(sim.productId)?.returnPct ?? 0,
        );
        const dayOpenPrice = toNumber(firstLiveTick?.price ?? 0);
        const liveTickPrice = toNumber(latestLiveTick?.price ?? 0);
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
            .map((price) => toNumber(price.close))
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
    const latestClose = toNumber(latestPrice?.close ?? 0);
    const previousClose = toNumber(previousPrice?.close ?? 0);

    const returnPct =
      previousClose > 0
        ? ((latestClose - previousClose) / previousClose) * 100
        : toNumber(latestPrice?.returnPct ?? 0);

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
    const dayOpenPrice = toNumber(firstLiveTick?.price ?? 0);
    const liveTickPrice = toNumber(latestLiveTick?.price ?? 0);
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
}
