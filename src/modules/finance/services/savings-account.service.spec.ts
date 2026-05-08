import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { QuestService } from 'src/modules/quest/quest.service';
import type { RandomExpenseService } from 'src/modules/random-expense/services/random-expense.service';
import type { PrismaService } from 'src/prisma/prisma.service';
import { SavingsAccountService } from './savings-account.service';
import type { WalletService } from './wallet.service';

const d = (value: number | string) => new Prisma.Decimal(value);

describe('SavingsAccountService', () => {
  let service: SavingsAccountService;
  let tx: any;
  let prisma: any;
  let walletService: { ensureWallet: jest.Mock };
  let questService: { completeInteractiveQuest: jest.Mock };
  let randomExpenseService: {
    autoPayPendingExpensesFromWalletTx: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      savingsAccount: {
        create: jest.fn(),
        update: jest.fn(),
      },
      savingsTransaction: { create: jest.fn() },
      wallet: { update: jest.fn() },
      walletTransaction: { create: jest.fn() },
    };
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      savingsAccountBank: { findUnique: jest.fn() },
      savingsAccount: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      term: { findUnique: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    walletService = { ensureWallet: jest.fn() };
    questService = { completeInteractiveQuest: jest.fn() };
    randomExpenseService = {
      autoPayPendingExpensesFromWalletTx: jest.fn().mockResolvedValue({
        walletBalanceAfter: d(95),
        paidExpenses: [],
      }),
    };

    service = new SavingsAccountService(
      prisma as unknown as PrismaService,
      walletService as unknown as WalletService,
      questService as unknown as QuestService,
      randomExpenseService as unknown as RandomExpenseService,
    );
  });

  it('opens an account with an initial deposit and completes the interactive quest', async () => {
    const account = {
      id: 'account-1',
      balance: d(100),
      savingsAccountBank: { bank: { name: 'Cash Bank' } },
    };
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 'student-1',
      userId: 'user-1',
      termId: 'term-1',
    });
    prisma.savingsAccountBank.findUnique.mockResolvedValue({
      id: 'config-1',
      bank: { id: 'bank-1', termId: 'term-1', name: 'Cash Bank' },
    });
    prisma.savingsAccount.findUnique.mockResolvedValue(null);
    prisma.term.findUnique.mockResolvedValue({
      termWeeks: [
        {
          weekNo: 3,
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
        },
      ],
    });
    tx.savingsAccount.create.mockResolvedValue(account);

    await expect(
      service.openAccount({
        studentProfileId: 'student-1',
        savingsAccountBankId: 'config-1',
        initialDeposit: 100,
      }),
    ).resolves.toEqual({
      success: true,
      data: account,
      interactiveQuestCompleted: true,
    });

    expect(tx.savingsAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          balance: expect.any(Prisma.Decimal),
          weekNo: 3,
          status: 'ACTIVE',
        }),
      }),
    );
    expect(tx.savingsTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        savingsAccountId: 'account-1',
        type: 'DEPOSIT',
        amount: expect.any(Prisma.Decimal),
      }),
    });
    expect(questService.completeInteractiveQuest).toHaveBeenCalledWith(
      'user-1',
      'OPENSAVINGACCOUNT',
    );
  });

  it('throws when opening an account for a missing student profile', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.openAccount({
        studentProfileId: 'missing',
        savingsAccountBankId: 'config-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deposits from wallet into an active savings account', async () => {
    prisma.savingsAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      status: 'ACTIVE',
      balance: d(25),
      studentProfile: {
        mainWallet: { id: 'wallet-1', balance: d(100) },
      },
      savingsAccountBank: { bank: { name: 'Cash Bank' } },
    });
    tx.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: d(60) });
    tx.savingsAccount.update.mockResolvedValue({
      id: 'account-1',
      balance: d(65),
    });

    await expect(
      service.depositFromWallet({ savingsAccountId: 'account-1', amount: 40 }),
    ).resolves.toEqual({
      success: true,
      data: {
        savingsAccount: { id: 'account-1', balance: d(65) },
        wallet: { id: 'wallet-1', balance: d(60) },
      },
    });

    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet-1',
        type: 'TRANSFER_OUT',
        metadata: {
          source: 'SAVINGS_DEPOSIT',
          refId: 'account-1',
        },
      }),
    });
    expect(tx.savingsTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        savingsAccountId: 'account-1',
        type: 'DEPOSIT',
      }),
    });
  });

  it('rejects deposits when the wallet balance is insufficient', async () => {
    prisma.savingsAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      status: 'ACTIVE',
      balance: d(25),
      studentProfile: {
        mainWallet: { id: 'wallet-1', balance: d(10) },
      },
      savingsAccountBank: { bank: { name: 'Cash Bank' } },
    });

    await expect(
      service.depositFromWallet({ savingsAccountId: 'account-1', amount: 40 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('withdraws to an existing wallet, applies fee, and triggers auto expense payment', async () => {
    prisma.savingsAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      status: 'ACTIVE',
      balance: d(100),
      withdrawCount: 1,
      studentProfile: {
        id: 'student-1',
        mainWallet: { id: 'wallet-1', balance: d(50) },
        term: { id: 'term-1' },
      },
      savingsAccountBank: {
        withdrawLimitPerTerm: 3,
        feePerTransaction: d(5),
      },
    });
    tx.savingsAccount.update.mockResolvedValue({
      id: 'account-1',
      balance: d(55),
      withdrawCount: 2,
    });
    tx.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: d(90) });

    const result = await service.withdrawToWallet({
      savingsAccountId: 'account-1',
      amount: 40,
    });

    expect(result.success).toBe(true);
    expect(result.data.remainingWithdrawals).toBe(1);
    expect(result.data.wallet.balance.toString()).toBe('95');
    expect(tx.savingsTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'FEE',
        amount: expect.any(Prisma.Decimal),
      }),
    });
    expect(
      randomExpenseService.autoPayPendingExpensesFromWalletTx,
    ).toHaveBeenCalledWith(tx, 'student-1');
  });

  it('prevents closing an account with a remaining balance', async () => {
    prisma.savingsAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      status: 'ACTIVE',
      balance: d(1),
    });

    await expect(service.closeAccount('account-1')).rejects.toThrow(
      'Cannot close account with remaining balance',
    );
  });
});
