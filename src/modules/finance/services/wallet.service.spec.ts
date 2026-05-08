import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import { WalletAccountFilter } from '../dto/wallet-transaction-history.dto';
import { WalletService } from './wallet.service';

type PrismaMock = {
  wallet: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  walletTransaction: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
};

describe('WalletService', () => {
  let service: WalletService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      wallet: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      walletTransaction: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new WalletService(prisma as unknown as PrismaService);
  });

  describe('ensureWallet', () => {
    it('upserts a zero-balance wallet for the student profile', async () => {
      prisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });

      await expect(service.ensureWallet('student-1')).resolves.toEqual({
        id: 'wallet-1',
      });

      expect(prisma.wallet.upsert).toHaveBeenCalledWith({
        where: { studentProfileId: 'student-1' },
        update: {},
        create: expect.objectContaining({
          studentProfileId: 'student-1',
          balance: expect.any(Object),
        }),
      });
      expect(
        prisma.wallet.upsert.mock.calls[0][0].create.balance.toString(),
      ).toBe('0');
    });
  });

  describe('getTransactionHistory', () => {
    beforeEach(() => {
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        studentProfileId: 'student-1',
      });
      prisma.walletTransaction.count.mockResolvedValue(3);
      prisma.walletTransaction.findMany.mockResolvedValue([
        { id: 'tx-1' },
        { id: 'tx-2' },
      ]);
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);

      await expect(
        service.getTransactionHistory('missing-wallet'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.walletTransaction.count).not.toHaveBeenCalled();
      expect(prisma.walletTransaction.findMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid pagination', async () => {
      await expect(
        service.getTransactionHistory(
          'wallet-1',
          undefined,
          undefined,
          undefined,
          undefined,
          0,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires year when filtering by month', async () => {
      await expect(
        service.getTransactionHistory('wallet-1', undefined, undefined, 5),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns transactions with pagination metadata', async () => {
      await expect(
        service.getTransactionHistory(
          'wallet-1',
          'QUEST_REWARD',
          undefined,
          undefined,
          2026,
          2,
          2,
        ),
      ).resolves.toEqual({
        success: true,
        data: {
          transactions: [{ id: 'tx-1' }, { id: 'tx-2' }],
          pagination: {
            total: 3,
            page: 2,
            limit: 2,
            totalPages: 2,
            hasNextPage: false,
            hasPreviousPage: true,
          },
        },
      });

      const expectedWhere = {
        walletId: 'wallet-1',
        type: 'QUEST_REWARD',
        createdAt: {
          gte: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),
          lt: new Date(Date.UTC(2027, 0, 1, 0, 0, 0, 0)),
        },
      };
      expect(prisma.walletTransaction.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { createdAt: 'desc' },
        skip: 2,
        take: 2,
      });
    });

    it('builds a savings account metadata filter for a selected month', async () => {
      await service.getTransactionHistory(
        'wallet-1',
        undefined,
        WalletAccountFilter.SAVINGS,
        5,
        2026,
      );

      expect(prisma.walletTransaction.count).toHaveBeenCalledWith({
        where: {
          walletId: 'wallet-1',
          createdAt: {
            gte: new Date(Date.UTC(2026, 4, 1, 0, 0, 0, 0)),
            lt: new Date(Date.UTC(2026, 5, 1, 0, 0, 0, 0)),
          },
          OR: [
            { metadata: { path: ['source'], equals: 'SAVINGS_DEPOSIT' } },
            { metadata: { path: ['source'], equals: 'SAVINGS_WITHDRAW' } },
          ],
        },
      });
    });
  });
});
