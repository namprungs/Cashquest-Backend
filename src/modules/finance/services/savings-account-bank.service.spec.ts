import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import { SavingsAccountBankService } from './savings-account-bank.service';

describe('SavingsAccountBankService', () => {
  let service: SavingsAccountBankService;
  let prisma: {
    bank: { findUnique: jest.Mock };
    savingsAccountBank: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      bank: { findUnique: jest.fn() },
      savingsAccountBank: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new SavingsAccountBankService(prisma as unknown as PrismaService);
  });

  it('creates a savings account config with default limits and fee', async () => {
    const config = { id: 'config-1' };
    prisma.bank.findUnique.mockResolvedValue({ id: 'bank-1' });
    prisma.savingsAccountBank.findUnique.mockResolvedValue(null);
    prisma.savingsAccountBank.create.mockResolvedValue(config);

    await expect(
      service.create('bank-1', { interestRate: 0.05 }),
    ).resolves.toEqual({ success: true, data: config });

    const data = prisma.savingsAccountBank.create.mock.calls[0][0].data;
    expect(data.bankId).toBe('bank-1');
    expect(data.interestRate.toString()).toBe('0.05');
    expect(data.withdrawLimitPerTerm).toBe(2000);
    expect(data.feePerTransaction.toString()).toBe('0');
  });

  it('throws when the bank already has a savings account config', async () => {
    prisma.bank.findUnique.mockResolvedValue({ id: 'bank-1' });
    prisma.savingsAccountBank.findUnique.mockResolvedValue({ id: 'config-1' });

    await expect(
      service.create('bank-1', { interestRate: 0.05 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates only provided fields', async () => {
    prisma.savingsAccountBank.findUnique.mockResolvedValue({ id: 'config-1' });
    prisma.savingsAccountBank.update.mockResolvedValue({ id: 'config-1' });

    await service.update('config-1', { feePerTransaction: 3 });

    const data = prisma.savingsAccountBank.update.mock.calls[0][0].data;
    expect(data.feePerTransaction.toString()).toBe('3');
    expect(data.interestRate).toBeUndefined();
    expect(data.withdrawLimitPerTerm).toBeUndefined();
  });

  it('prevents deleting a config with active savings accounts', async () => {
    prisma.savingsAccountBank.findUnique.mockResolvedValue({
      id: 'config-1',
      savingsAccounts: [{ id: 'account-1' }],
    });

    await expect(service.remove('config-1')).rejects.toThrow(
      'Cannot delete savings account bank config with active accounts',
    );
    expect(prisma.savingsAccountBank.delete).not.toHaveBeenCalled();
  });

  it('throws when a config cannot be found', async () => {
    prisma.savingsAccountBank.findUnique.mockResolvedValue(null);

    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
