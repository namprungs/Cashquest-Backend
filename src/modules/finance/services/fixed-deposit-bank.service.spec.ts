import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import { FixedDepositBankService } from './fixed-deposit-bank.service';

describe('FixedDepositBankService', () => {
  let service: FixedDepositBankService;
  let prisma: {
    bank: { findUnique: jest.Mock };
    fixedDepositBank: {
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
      fixedDepositBank: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new FixedDepositBankService(prisma as unknown as PrismaService);
  });

  it('creates a fixed deposit bank config', async () => {
    const config = { id: 'fd-bank-1' };
    prisma.bank.findUnique.mockResolvedValue({ id: 'bank-1' });
    prisma.fixedDepositBank.findUnique.mockResolvedValue(null);
    prisma.fixedDepositBank.create.mockResolvedValue(config);

    await expect(
      service.create('bank-1', {
        interestRate: 0.12,
        fixedDepositWeeks: 4,
        principal: 1000,
      }),
    ).resolves.toEqual({ success: true, data: config });

    const data = prisma.fixedDepositBank.create.mock.calls[0][0].data;
    expect(data.bankId).toBe('bank-1');
    expect(data.interestRate.toString()).toBe('0.12');
    expect(data.fixedDepositWeeks).toBe(4);
    expect(data.principal.toString()).toBe('1000');
  });

  it('throws when a fixed deposit config already exists for the bank', async () => {
    prisma.bank.findUnique.mockResolvedValue({ id: 'bank-1' });
    prisma.fixedDepositBank.findUnique.mockResolvedValue({ id: 'fd-bank-1' });

    await expect(
      service.create('bank-1', {
        interestRate: 0.12,
        fixedDepositWeeks: 4,
        principal: 1000,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates decimal and scalar fields', async () => {
    prisma.fixedDepositBank.findUnique.mockResolvedValue({ id: 'fd-bank-1' });
    prisma.fixedDepositBank.update.mockResolvedValue({ id: 'fd-bank-1' });

    await service.update('fd-bank-1', {
      interestRate: 0.2,
      fixedDepositWeeks: 8,
    });

    const data = prisma.fixedDepositBank.update.mock.calls[0][0].data;
    expect(data.interestRate.toString()).toBe('0.2');
    expect(data.fixedDepositWeeks).toBe(8);
    expect(data.principal).toBeUndefined();
  });

  it('prevents deleting a config with active fixed deposits', async () => {
    prisma.fixedDepositBank.findUnique.mockResolvedValue({
      id: 'fd-bank-1',
      fixedDeposits: [{ id: 'fd-1' }],
    });

    await expect(service.remove('fd-bank-1')).rejects.toThrow(
      'Cannot delete fixed deposit bank config with active deposits',
    );
    expect(prisma.fixedDepositBank.delete).not.toHaveBeenCalled();
  });

  it('throws when a config cannot be found', async () => {
    prisma.fixedDepositBank.findUnique.mockResolvedValue(null);

    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
