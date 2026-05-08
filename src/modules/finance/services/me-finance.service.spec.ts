import { NotFoundException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import type { PrismaService } from 'src/prisma/prisma.service';
import { MeFinanceService } from './me-finance.service';

const d = (value: number | string) => new Prisma.Decimal(value);

describe('MeFinanceService', () => {
  let service: MeFinanceService;
  let prisma: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-20T10:00:00.000Z'));
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      savingsAccount: { findMany: jest.fn() },
      fixedDeposit: { findMany: jest.fn() },
      walletTransaction: { findFirst: jest.fn() },
      investmentTransaction: { findFirst: jest.fn() },
      savingsTransaction: { findMany: jest.fn() },
    };
    service = new MeFinanceService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('throws when the user has no student profile in the term', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.getDashboard('term-1', { id: 'user-1' } as unknown as User),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds dashboard totals and previous month change', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 'student-1',
      mainWallet: { id: 'wallet-1', balance: d(100) },
      investmentWallet: { id: 'investment-wallet-1', balance: d(40) },
    });
    prisma.savingsAccount.findMany.mockResolvedValue([
      {
        id: 'savings-1',
        balance: d(60),
        createdAt: new Date('2026-04-15T00:00:00.000Z'),
      },
    ]);
    prisma.fixedDeposit.findMany
      .mockResolvedValueOnce([
        {
          id: 'fd-1',
          principal: d(200),
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ principal: d(150) }]);
    prisma.walletTransaction.findFirst
      .mockResolvedValueOnce({ balanceAfter: d(80) })
      .mockResolvedValueOnce(null);
    prisma.investmentTransaction.findFirst
      .mockResolvedValueOnce({ balanceAfter: d(30) })
      .mockResolvedValueOnce(null);
    prisma.savingsTransaction.findMany
      .mockResolvedValueOnce([
        { savingsAccountId: 'savings-1', balanceAfter: d(50) },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      service.getDashboard('term-1', { id: 'user-1' } as unknown as User),
    ).resolves.toEqual({
      success: true,
      data: {
        termId: 'term-1',
        studentProfileId: 'student-1',
        walletId: 'wallet-1',
        investmentWalletId: 'investment-wallet-1',
        summary: {
          totalAssets: 400,
          changeFromPreviousMonth: 90,
        },
        breakdown: {
          cash: 100,
          savings: 60,
          fixedDeposit: 200,
          investment: 40,
          investmentCash: 40,
          investmentMarketValue: 0,
        },
      },
    });
  });
});
