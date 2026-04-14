import { Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MeFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      'toNumber' in value &&
      typeof (value as { toNumber: unknown }).toNumber === 'function'
    ) {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  async getDashboard(termId: string, user: User) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: {
        userId_termId: {
          userId: user.id,
          termId,
        },
      },
      select: {
        id: true,
        mainWallet: {
          select: {
            id: true,
            balance: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Student profile not found for this term');
    }

    const [savingsAccounts, fixedDeposits, holdings] = await Promise.all([
      this.prisma.savingsAccount.findMany({
        where: {
          studentProfileId: profile.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          balance: true,
        },
      }),
      this.prisma.fixedDeposit.findMany({
        where: {
          studentProfileId: profile.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          principal: true,
        },
      }),
      this.prisma.holding.findMany({
        where: {
          studentProfileId: profile.id,
          termId,
        },
        select: {
          productId: true,
          units: true,
        },
      }),
    ]);

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
    for (const price of latestPrices) {
      if (!latestPriceByProduct.has(price.productId)) {
        latestPriceByProduct.set(price.productId, price);
      }
    }

    let marketValue = 0;

    for (const holding of holdings) {
      const units = this.toNumber(holding.units);
      const lastPrice = this.toNumber(
        latestPriceByProduct.get(holding.productId)?.close,
      );

      marketValue += units * lastPrice;
    }

    const walletBalance = this.toNumber(profile.mainWallet?.balance);
    const savingsBalance = savingsAccounts.reduce(
      (sum, account) => sum + this.toNumber(account.balance),
      0,
    );
    const fixedDepositBalance = fixedDeposits.reduce(
      (sum, deposit) => sum + this.toNumber(deposit.principal),
      0,
    );

    return {
      success: true,
      data: {
        termId,
        studentProfileId: profile.id,
        walletId: profile.mainWallet?.id ?? null,
        summary: {
          totalAssets:
            walletBalance + savingsBalance + fixedDepositBalance + marketValue,
          changeFromPreviousMonth: null,
        },
        breakdown: {
          cash: walletBalance,
          savings: savingsBalance,
          fixedDeposit: fixedDepositBalance,
          investment: marketValue,
        },
      },
    };
  }
}
