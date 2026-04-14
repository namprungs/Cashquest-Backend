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
        investmentWallet: {
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

    const [savingsAccounts, fixedDeposits] = await Promise.all([
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
    ]);

    const walletBalance = this.toNumber(profile.mainWallet?.balance);
    const investmentWalletBalance = this.toNumber(
      profile.investmentWallet?.balance,
    );
    const savingsBalance = savingsAccounts.reduce(
      (sum, account) => sum + this.toNumber(account.balance),
      0,
    );
    const fixedDepositBalance = fixedDeposits.reduce(
      (sum, deposit) => sum + this.toNumber(deposit.principal),
      0,
    );

    const investmentTotal = investmentWalletBalance;

    return {
      success: true,
      data: {
        termId,
        studentProfileId: profile.id,
        walletId: profile.mainWallet?.id ?? null,
        investmentWalletId: profile.investmentWallet?.id ?? null,
        summary: {
          totalAssets:
            walletBalance +
            savingsBalance +
            fixedDepositBalance +
            investmentTotal,
          changeFromPreviousMonth: null,
        },
        breakdown: {
          cash: walletBalance,
          savings: savingsBalance,
          fixedDeposit: fixedDepositBalance,
          investment: investmentTotal,
          investmentCash: investmentWalletBalance,
          investmentMarketValue: 0,
        },
      },
    };
  }
}
