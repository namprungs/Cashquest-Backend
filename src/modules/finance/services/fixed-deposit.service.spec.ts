import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RandomExpenseService } from 'src/modules/random-expense/services/random-expense.service';
import type { PrismaService } from 'src/prisma/prisma.service';
import { FixedDepositService } from './fixed-deposit.service';
import type { WalletService } from './wallet.service';

const d = (value: number | string) => new Prisma.Decimal(value);

describe('FixedDepositService', () => {
  let service: FixedDepositService;
  let tx: any;
  let prisma: any;
  let walletService: { ensureWalletTx: jest.Mock };
  let randomExpenseService: {
    autoPayPendingExpensesFromWalletTx: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      fixedDeposit: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      wallet: { update: jest.fn() },
      walletTransaction: { create: jest.fn() },
      fixedDepositTransaction: { create: jest.fn() },
      term: { findUnique: jest.fn() },
    };
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      fixedDepositBank: { findUnique: jest.fn() },
      fixedDeposit: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      term: { findUnique: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    walletService = {
      ensureWalletTx: jest.fn().mockResolvedValue({
        id: 'wallet-1',
        balance: d(1000),
      }),
    };
    randomExpenseService = {
      autoPayPendingExpensesFromWalletTx: jest.fn().mockResolvedValue({
        walletBalanceAfter: d(1200),
        paidExpenses: [],
      }),
    };

    service = new FixedDepositService(
      prisma as unknown as PrismaService,
      walletService as unknown as WalletService,
      randomExpenseService as unknown as RandomExpenseService,
    );
  });

  it('opens a fixed deposit and deducts principal from wallet', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 'student-1',
      termId: 'term-1',
      mainWallet: { id: 'wallet-1', balance: d(1000) },
    });
    prisma.fixedDepositBank.findUnique.mockResolvedValue({
      id: 'fd-bank-1',
      interestRate: d(0.12),
      fixedDepositWeeks: 4,
      bank: { id: 'bank-1', termId: 'term-1', name: 'Cash Bank' },
    });
    prisma.term.findUnique.mockResolvedValue({
      termWeeks: [
        {
          weekNo: 2,
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
        },
      ],
    });
    tx.fixedDeposit.findFirst.mockResolvedValue(null);
    tx.fixedDeposit.create.mockResolvedValue({
      id: 'fd-1',
      principal: d(200),
      status: 'ACTIVE',
    });
    tx.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: d(800) });

    await expect(
      service.openFixedDeposit({
        studentProfileId: 'student-1',
        fixedDepositBankId: 'fd-bank-1',
        principal: 200,
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: 'fd-1', principal: d(200), status: 'ACTIVE' },
    });

    expect(tx.fixedDeposit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentProfileId: 'student-1',
        fixedDepositBankId: 'fd-bank-1',
        principal: expect.any(Prisma.Decimal),
        startWeekNo: 2,
        maturityWeekNo: 6,
        status: 'ACTIVE',
      }),
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'TRANSFER_OUT',
        metadata: {
          source: 'FIXED_DEPOSIT_OPEN',
          refId: 'fd-1',
        },
      }),
    });
  });

  it('rejects opening a fixed deposit when bank and student are in different terms', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 'student-1',
      termId: 'term-1',
    });
    prisma.fixedDepositBank.findUnique.mockResolvedValue({
      id: 'fd-bank-1',
      bank: { termId: 'term-2' },
    });

    await expect(
      service.openFixedDeposit({
        studentProfileId: 'student-1',
        fixedDepositBankId: 'fd-bank-1',
        principal: 200,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pays out matured fixed deposits with interest', async () => {
    prisma.fixedDeposit.findUnique.mockResolvedValue({
      id: 'fd-1',
      studentProfileId: 'student-1',
      status: 'ACTIVE',
      principal: d(1000),
      interestRate: d(0.16),
      startWeekNo: 1,
      maturityWeekNo: 4,
      studentProfile: { mainWallet: null, termId: 'term-1' },
      fixedDepositBank: { bank: { name: 'Cash Bank' } },
    });
    prisma.term.findUnique.mockResolvedValue({
      termWeeks: [
        {
          weekNo: 5,
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
        },
      ],
    });
    tx.term.findUnique.mockResolvedValue({ totalWeeks: 16 });
    tx.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: d(2040) });

    const result = await service.withdrawFixedDeposit({
      fixedDepositId: 'fd-1',
    });

    expect(result.data.status).toBe('MATURED');
    expect(result.data.interestAmount).toBe('40');
    expect(result.data.amountPaid).toBe('1040');
    expect(tx.fixedDeposit.update).toHaveBeenCalledWith({
      where: { id: 'fd-1' },
      data: { status: 'MATURED' },
    });
  });

  it('throws when a fixed deposit does not exist', async () => {
    prisma.fixedDeposit.findUnique.mockResolvedValue(null);

    await expect(
      service.withdrawFixedDeposit({ fixedDepositId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calculates bank statistics including total principal', async () => {
    prisma.fixedDepositBank.findUnique.mockResolvedValue({
      bank: { id: 'bank-1', name: 'Cash Bank' },
      fixedDeposits: [
        { status: 'ACTIVE', principal: d(100) },
        { status: 'MATURED', principal: d(200) },
        { status: 'WITHDRAWN_EARLY', principal: d(300) },
      ],
    });

    const result = await service.getBankStatistics('fd-bank-1');

    expect(result.data.statistics).toMatchObject({
      totalDeposits: 3,
      activeDeposits: 1,
      maturedDeposits: 1,
      earlyWithdrawals: 1,
    });
    expect(result.data.statistics.totalPrincipal.toString()).toBe('600');
  });
});
