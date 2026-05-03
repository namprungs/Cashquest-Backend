import { Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { toNumber } from 'src/common/utils/number.utils';

@Injectable()
export class MeFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber = toNumber;

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
          createdAt: true,
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
          createdAt: true,
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
    const currentTotalAssets =
      walletBalance + savingsBalance + fixedDepositBalance + investmentTotal;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      mainWalletSnapshot,
      investmentWalletSnapshot,
      mainWalletFirstInMonth,
      investmentWalletFirstInMonth,
      savingsSnapshots,
      savingsMonthTransactions,
      fixedDepositSnapshots,
    ] = await Promise.all([
      profile.mainWallet?.id
        ? this.prisma.walletTransaction.findFirst({
            where: {
              walletId: profile.mainWallet.id,
              createdAt: { lt: monthStart },
            },
            orderBy: [{ createdAt: 'desc' }],
            select: {
              balanceAfter: true,
            },
          })
        : Promise.resolve(null),
      profile.investmentWallet?.id
        ? this.prisma.investmentTransaction.findFirst({
            where: {
              investmentWalletId: profile.investmentWallet.id,
              createdAt: { lt: monthStart },
            },
            orderBy: [{ createdAt: 'desc' }],
            select: {
              balanceAfter: true,
            },
          })
        : Promise.resolve(null),
      profile.mainWallet?.id
        ? this.prisma.walletTransaction.findFirst({
            where: {
              walletId: profile.mainWallet.id,
              createdAt: { gte: monthStart },
            },
            orderBy: [{ createdAt: 'asc' }],
            select: {
              balanceBefore: true,
            },
          })
        : Promise.resolve(null),
      profile.investmentWallet?.id
        ? this.prisma.investmentTransaction.findFirst({
            where: {
              investmentWalletId: profile.investmentWallet.id,
              createdAt: { gte: monthStart },
            },
            orderBy: [{ createdAt: 'asc' }],
            select: {
              balanceBefore: true,
            },
          })
        : Promise.resolve(null),
      this.prisma.savingsTransaction.findMany({
        where: {
          savingsAccount: {
            studentProfileId: profile.id,
          },
          createdAt: { lt: monthStart },
        },
        orderBy: [{ savingsAccountId: 'asc' }, { createdAt: 'desc' }],
        distinct: ['savingsAccountId'],
        select: {
          savingsAccountId: true,
          balanceAfter: true,
        },
      }),
      this.prisma.savingsTransaction.findMany({
        where: {
          savingsAccount: {
            studentProfileId: profile.id,
          },
          createdAt: { gte: monthStart },
        },
        select: {
          savingsAccountId: true,
          type: true,
          amount: true,
        },
      }),
      this.prisma.fixedDeposit.findMany({
        where: {
          studentProfileId: profile.id,
          createdAt: { lt: monthStart },
          OR: [{ status: 'ACTIVE' }, { updatedAt: { gte: monthStart } }],
        },
        select: {
          principal: true,
        },
      }),
    ]);

    const previousWalletBalance = this.toNumber(
      mainWalletSnapshot?.balanceAfter ??
        mainWalletFirstInMonth?.balanceBefore ??
        (profile.mainWallet?.id ? walletBalance : 0),
    );
    const previousInvestmentWalletBalance = this.toNumber(
      investmentWalletSnapshot?.balanceAfter ??
        investmentWalletFirstInMonth?.balanceBefore ??
        (profile.investmentWallet?.id ? investmentWalletBalance : 0),
    );
    const savingsSnapshotByAccount = new Map(
      savingsSnapshots.map((snapshot) => [
        snapshot.savingsAccountId,
        this.toNumber(snapshot.balanceAfter),
      ]),
    );
    const savingsMonthNetByAccount = new Map<string, number>();
    for (const tx of savingsMonthTransactions) {
      const type = (tx.type ?? '').toUpperCase();
      const amount = this.toNumber(tx.amount);
      const sign =
        type === 'DEPOSIT' || type === 'INTEREST'
          ? 1
          : type === 'WITHDRAW' || type === 'FEE'
            ? -1
            : 0;
      const current = savingsMonthNetByAccount.get(tx.savingsAccountId) ?? 0;
      savingsMonthNetByAccount.set(
        tx.savingsAccountId,
        current + sign * amount,
      );
    }

    const previousSavingsBalance = savingsAccounts.reduce((sum, account) => {
      const fromSnapshot = savingsSnapshotByAccount.get(account.id);
      if (fromSnapshot != null) {
        return sum + fromSnapshot;
      }

      if (account.createdAt >= monthStart) {
        return sum;
      }

      const monthNet = savingsMonthNetByAccount.get(account.id) ?? 0;
      return sum + (this.toNumber(account.balance) - monthNet);
    }, 0);
    const previousFixedDepositBalance = fixedDepositSnapshots.reduce(
      (sum, snapshot) => sum + this.toNumber(snapshot.principal),
      0,
    );
    const previousTotalAssets =
      previousWalletBalance +
      previousInvestmentWalletBalance +
      previousSavingsBalance +
      previousFixedDepositBalance;

    const changeFromPreviousMonth = currentTotalAssets - previousTotalAssets;

    return {
      success: true,
      data: {
        termId,
        studentProfileId: profile.id,
        walletId: profile.mainWallet?.id ?? null,
        investmentWalletId: profile.investmentWallet?.id ?? null,
        summary: {
          totalAssets: currentTotalAssets,
          changeFromPreviousMonth,
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
