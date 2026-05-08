import { Prisma } from '@prisma/client';
import type { PrismaService } from 'src/prisma/prisma.service';
import { SavingsInterestService } from './savings-interest.service';

const d = (value: number | string) => new Prisma.Decimal(value);

describe('SavingsInterestService', () => {
  let service: SavingsInterestService;
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-16T03:00:00.000Z'));
    tx = {
      savingsInterestLog: { create: jest.fn() },
      savingsAccount: { update: jest.fn() },
      savingsTransaction: { create: jest.fn() },
    };
    prisma = {
      term: { findFirst: jest.fn() },
      savingsAccount: { findMany: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    service = new SavingsInterestService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('manually applies interest on a payout day', async () => {
    prisma.term.findFirst.mockResolvedValue({
      id: 'term-1',
      termWeeks: [
        {
          weekNo: 4,
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
        },
      ],
    });
    prisma.savingsAccount.findMany.mockResolvedValue([
      {
        id: 'account-1',
        balance: d(100),
        savingsAccountBank: { id: 'config-1', interestRate: d(0.16) },
        studentProfile: { termId: 'term-1' },
      },
    ]);

    await expect(service.triggerInterestCalculation()).resolves.toEqual({
      success: true,
      message: 'Interest calculation completed successfully',
      processedAccounts: 1,
      totalInterest: '1',
    });

    expect(tx.savingsInterestLog.create).toHaveBeenCalledWith({
      data: {
        savingsAccountId: 'account-1',
        weekNo: 4,
        rateUsed: d(0.16),
        interestAmount: d(1),
      },
    });
    expect(tx.savingsAccount.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { balance: d(101) },
    });
    expect(tx.savingsTransaction.create).toHaveBeenCalledWith({
      data: {
        savingsAccountId: 'account-1',
        type: 'INTEREST',
        amount: d(1),
        balanceAfter: d(101),
      },
    });
  });

  it('returns failure when today is not a configured payout day', async () => {
    jest.setSystemTime(new Date('2026-05-10T03:00:00.000Z'));
    prisma.term.findFirst.mockResolvedValue({
      id: 'term-1',
      termWeeks: [
        {
          weekNo: 2,
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
        },
      ],
    });
    prisma.savingsAccount.findMany.mockResolvedValue([]);

    await expect(service.triggerInterestCalculation()).resolves.toEqual({
      success: false,
      message: 'Today is not a configured payout day (1 or 16)',
      processedAccounts: 0,
      totalInterest: '0',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns failure when the current week cannot be determined', async () => {
    prisma.term.findFirst.mockResolvedValue(null);

    await expect(service.triggerInterestCalculation()).resolves.toEqual({
      success: false,
      message: 'Could not determine current week number',
      processedAccounts: 0,
      totalInterest: '0',
    });
  });
});
