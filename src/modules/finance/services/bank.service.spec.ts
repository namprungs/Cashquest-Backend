import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import { BankService } from './bank.service';

describe('BankService', () => {
  let service: BankService;
  let prisma: {
    term: { findUnique: jest.Mock };
    bank: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    savingsAccountBank: { findMany: jest.Mock };
    fixedDepositBank: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      term: { findUnique: jest.fn() },
      bank: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      savingsAccountBank: { findMany: jest.fn() },
      fixedDepositBank: { findMany: jest.fn() },
    };
    service = new BankService(prisma as unknown as PrismaService);
  });

  it('creates a bank when the term exists', async () => {
    const bank = { id: 'bank-1', name: 'Cash Bank' };
    prisma.term.findUnique.mockResolvedValue({ id: 'term-1' });
    prisma.bank.create.mockResolvedValue(bank);

    await expect(
      service.createBank({
        termId: 'term-1',
        name: 'Cash Bank',
        logoUrl: 'logo.png',
      }),
    ).resolves.toEqual({ success: true, data: bank });

    expect(prisma.bank.create).toHaveBeenCalledWith({
      data: {
        termId: 'term-1',
        name: 'Cash Bank',
        logoUrl: 'logo.png',
      },
    });
  });

  it('throws when creating a bank for a missing term', async () => {
    prisma.term.findUnique.mockResolvedValue(null);

    await expect(
      service.createBank({ termId: 'missing', name: 'Bank' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prevents deleting banks that still have active accounts', async () => {
    prisma.bank.findUnique.mockResolvedValue({
      savingsAccountBank: { savingsAccounts: [{ id: 'sa-1' }] },
      fixedDepositBank: null,
    });

    await expect(service.deleteBank('bank-1')).rejects.toThrow(
      'Cannot delete bank with active accounts',
    );
    expect(prisma.bank.delete).not.toHaveBeenCalled();
  });

  it('calculates bank statistics from related accounts and deposits', async () => {
    prisma.bank.findUnique.mockResolvedValue({
      id: 'bank-1',
      name: 'Cash Bank',
      savingsAccountBank: {
        savingsAccounts: [{ status: 'ACTIVE' }, { status: 'CLOSED' }],
      },
      fixedDepositBank: {
        fixedDeposits: [
          { status: 'ACTIVE' },
          { status: 'MATURED' },
          { status: 'WITHDRAWN_EARLY' },
        ],
      },
    });

    await expect(service.getBankStatistics('bank-1')).resolves.toEqual({
      success: true,
      data: {
        bank: { id: 'bank-1', name: 'Cash Bank' },
        savingsAccount: {
          totalAccounts: 2,
          activeAccounts: 1,
        },
        fixedDeposit: {
          totalDeposits: 3,
          activeDeposits: 1,
          maturedDeposits: 1,
        },
      },
    });
  });
});
