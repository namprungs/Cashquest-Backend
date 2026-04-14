import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type CurrentUser = User & { role?: { name?: string } | null };
export type TxClient = Prisma.TransactionClient;

@Injectable()
export class InvestmentCoreService {
  constructor(private readonly prisma: PrismaService) {}

  assertTeacherOrAdmin(user: CurrentUser) {
    const roleName = user?.role?.name?.toUpperCase?.();
    if (!roleName || !['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(roleName)) {
      throw new ForbiddenException(
        'Only teacher/admin can perform this action',
      );
    }
  }

  assertStudent(user: CurrentUser) {
    const roleName = user?.role?.name?.toUpperCase?.();
    if (!roleName || roleName !== 'STUDENT') {
      throw new ForbiddenException('Only student can perform this action');
    }
  }

  toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return Number(value);
  }

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
    const simulation = await tx.termSimulation.findUnique({
      where: { termId },
      select: { currentWeek: true },
    });
    return simulation?.currentWeek ?? 1;
  }

  gaussianRandom() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  resolveEventAdjustments(impact: unknown) {
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

  eventAppliesToProduct(impact: unknown, sector?: string | null) {
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
}
