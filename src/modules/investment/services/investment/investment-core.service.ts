import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { toNumber as _toNumber } from 'src/common/utils/number.utils';

export type TxClient = Prisma.TransactionClient;
type EventProductContext = {
  symbol?: string | null;
  sector?: string | null;
  riskLevel?: string | null;
};
type EventAdjustments = {
  muAdjustment: number;
  sigmaAdjustment: number;
  sigmaMultiplier: number;
};

@Injectable()
export class InvestmentCoreService {
  constructor(private readonly prisma: PrismaService) {}

  toInputJson(
    value: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value as Prisma.InputJsonValue;
  }

  async assertTermExists(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });
    if (!term) {
      throw new NotFoundException('Term not found');
    }
  }

  async getStudentProfileOrThrow(userId: string, termId: string) {
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
        mainWallet: {
          select: {
            id: true,
            balance: true,
          },
        },
        investmentWallet: {
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

  async getCurrentWeek(
    termId: string,
    tx: PrismaService | TxClient = this.prisma,
  ) {
    const [simulation, calendarWeek] = await Promise.all([
      tx.termSimulation.findUnique({
        where: { termId },
        select: { currentWeek: true },
      }),
      this.getCalendarCurrentWeek(termId, tx),
    ]);

    const simulationWeek = simulation?.currentWeek ?? 1;
    const currentWeek = Math.max(simulationWeek, calendarWeek);

    if (currentWeek > simulationWeek) {
      await tx.termSimulation.upsert({
        where: { termId },
        update: { currentWeek },
        create: {
          termId,
          randomSeed: 0,
          currentWeek,
          engineVersion: 'calendar-sync-v1',
        },
      });
    }

    return currentWeek;
  }

  private async getCalendarCurrentWeek(
    termId: string,
    tx: PrismaService | TxClient = this.prisma,
  ) {
    const term = await tx.term.findUnique({
      where: { id: termId },
      select: {
        startDate: true,
        totalWeeks: true,
        termWeeks: {
          orderBy: { weekNo: 'asc' },
          select: {
            weekNo: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!term) {
      return 1;
    }

    const now = new Date();
    const activeWeek = term.termWeeks.find(
      (week) => week.startDate <= now && week.endDate >= now,
    );

    if (activeWeek) {
      return activeWeek.weekNo;
    }

    const firstWeek = term.termWeeks[0];
    const lastWeek = term.termWeeks[term.termWeeks.length - 1];

    if (firstWeek && now < firstWeek.startDate) {
      return firstWeek.weekNo;
    }

    if (lastWeek && now > lastWeek.endDate) {
      return lastWeek.weekNo;
    }

    const diffDays = Math.floor(
      (now.getTime() - term.startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    return Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), term.totalWeeks);
  }

  gaussianRandom() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  resolveEventAdjustments(
    impact: unknown,
    product?: EventProductContext | null,
  ): EventAdjustments {
    if (!impact || typeof impact !== 'object' || Array.isArray(impact)) {
      return { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 };
    }

    const data = impact as Record<string, unknown>;
    const impactParts = [
      data,
      this.asRecord(data.global),
      this.resolveAssetImpact(data.assets, product),
    ].filter((item): item is Record<string, unknown> => item !== undefined);

    return impactParts.reduce<EventAdjustments>(
      (acc, item) => {
        const muAdjustment =
          _toNumber(item.muAdjustment) ||
          _toNumber(item.driftShift) ||
          _toNumber(item.muShift) ||
          _toNumber(item.mu) ||
          0;

        const sigmaAdjustment =
          _toNumber(item.sigmaAdjustment) ||
          _toNumber(item.volatilityShift) ||
          _toNumber(item.sigma) ||
          0;

        const sigmaMultiplier =
          _toNumber(item.sigmaMultiplier) ||
          _toNumber(item.volatilityMultiplier) ||
          1;

        return {
          muAdjustment: acc.muAdjustment + muAdjustment,
          sigmaAdjustment: acc.sigmaAdjustment + sigmaAdjustment,
          sigmaMultiplier:
            acc.sigmaMultiplier * (sigmaMultiplier <= 0 ? 1 : sigmaMultiplier),
        };
      },
      { muAdjustment: 0, sigmaAdjustment: 0, sigmaMultiplier: 1 },
    );
  }

  normalizeStringArray(value: unknown): string[] {
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

  eventAppliesToProduct(
    impact: unknown,
    productOrSector?: EventProductContext | string | null,
  ) {
    if (!impact || typeof impact !== 'object' || Array.isArray(impact)) {
      return true;
    }

    const data = impact as Record<string, unknown>;
    const product =
      typeof productOrSector === 'string'
        ? { sector: productOrSector }
        : (productOrSector ?? {});
    const targetSectors = this.normalizeStringArray(
      data.targetSectors ?? data.sectors ?? data.targetSector,
    );
    const excludeSectors = this.normalizeStringArray(
      data.excludeSectors ?? data.excludedSectors,
    );

    const hasAssetTargets =
      !!this.asRecord(data.assets) &&
      Object.keys(this.asRecord(data.assets)!).length > 0;
    const hasGlobalImpact = !!this.asRecord(data.global);
    const hasRootImpact = this.hasAdjustmentFields(data);

    if (!targetSectors.length && !excludeSectors.length && !hasAssetTargets) {
      return true;
    }

    const normalizedSector = (product.sector ?? '').trim().toUpperCase();
    if ((targetSectors.length || excludeSectors.length) && !normalizedSector) {
      return false;
    }

    if (targetSectors.length && !targetSectors.includes(normalizedSector)) {
      return false;
    }

    if (excludeSectors.includes(normalizedSector)) {
      return false;
    }

    if (!hasAssetTargets) {
      return true;
    }

    return (
      hasGlobalImpact ||
      hasRootImpact ||
      !!this.resolveAssetImpact(data.assets, product)
    );
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private resolveAssetImpact(
    assets: unknown,
    product?: EventProductContext | null,
  ): Record<string, unknown> | undefined {
    const assetMap = this.asRecord(assets);
    if (!assetMap || !product) {
      return undefined;
    }

    const keys = this.getEventAssetKeys(product);
    for (const key of keys) {
      const value = assetMap[key];
      const record = this.asRecord(value);
      if (record) {
        return record;
      }
    }

    return undefined;
  }

  private hasAdjustmentFields(data: Record<string, unknown>) {
    return [
      data.muAdjustment,
      data.driftShift,
      data.muShift,
      data.mu,
      data.sigmaAdjustment,
      data.volatilityShift,
      data.sigma,
      data.sigmaMultiplier,
      data.volatilityMultiplier,
    ].some((value) => value !== undefined && value !== null);
  }

  private getEventAssetKeys(product: EventProductContext) {
    const symbol = (product.symbol ?? '').trim().toUpperCase();
    const sector = (product.sector ?? '').trim().toUpperCase();
    const riskLevel = (product.riskLevel ?? '').trim().toUpperCase();

    const seededAssetAliases: Record<string, string> = {
      SCHMART: 'L1',
      HLTHPLS: 'L2',
      GRNPWR: 'M1',
      FSTFIN: 'M2',
      TWAV: 'H1',
      GHUB: 'H2',
    };

    return [
      symbol,
      seededAssetAliases[symbol],
      sector,
      riskLevel,
      riskLevel === 'LOW' ? 'L' : undefined,
      riskLevel === 'MED' ? 'M' : undefined,
      riskLevel === 'HIGH' ? 'H' : undefined,
    ].filter((item): item is string => !!item);
  }
}
