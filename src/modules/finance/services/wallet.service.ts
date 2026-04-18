import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletAccountFilter } from '../dto/wallet-transaction-history.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  // ใช้ตอนอยู่นอก transaction
  async ensureWallet(studentProfileId: string) {
    return this.prisma.wallet.upsert({
      where: { studentProfileId },
      update: {}, // มีอยู่แล้วไม่ต้องทำอะไร
      create: {
        studentProfileId,
        balance: new Prisma.Decimal(0),
      },
    });
  }

  // ✅ ใช้ตอน bootstrap ที่ต้อง atomic
  async ensureWalletTx(tx: Prisma.TransactionClient, studentProfileId: string) {
    return tx.wallet.upsert({
      where: { studentProfileId },
      update: {},
      create: {
        studentProfileId,
        balance: new Prisma.Decimal(0),
      },
    });
  }

  /**
   * Get wallet transaction history with filtering, pagination, and sorting
   */
  async getTransactionHistory(
    walletId: string,
    type?: string,
    account?: WalletAccountFilter,
    month?: number,
    year?: number,
    page: number = 1,
    limit: number = 20,
  ) {
    // Validate wallet exists
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, studentProfileId: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'Invalid pagination parameters. Page must be >= 1, limit must be 1-100',
      );
    }

    if (month !== undefined && year === undefined) {
      throw new BadRequestException('year is required when filtering by month');
    }

    const skip = (page - 1) * limit;

    let createdAtFilter: Prisma.DateTimeFilter | undefined;
    if (year !== undefined) {
      const start =
        month !== undefined
          ? new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
          : new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const end =
        month !== undefined
          ? new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
          : new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
      createdAtFilter = {
        gte: start,
        lt: end,
      };
    }

    const savingsSources = ['SAVINGS_DEPOSIT', 'SAVINGS_WITHDRAW'];
    const fixedDepositSources = [
      'FIXED_DEPOSIT_OPEN',
      'FIXED_DEPOSIT_MATURITY',
      'FIXED_DEPOSIT_EARLY_WITHDRAWAL',
    ];
    const investmentSources = [
      'INVESTMENT_TRANSFER_IN',
      'INVESTMENT_TRANSFER_OUT',
    ];
    const nonWalletSources = [
      ...savingsSources,
      ...fixedDepositSources,
      ...investmentSources,
    ];

    const sourceEqualsFilter = (
      source: string,
    ): Prisma.WalletTransactionWhereInput => ({
      metadata: {
        path: ['source'],
        equals: source,
      },
    });

    let accountFilter: Prisma.WalletTransactionWhereInput | undefined;
    if (account === WalletAccountFilter.SAVINGS) {
      accountFilter = { OR: savingsSources.map(sourceEqualsFilter) };
    } else if (account === WalletAccountFilter.FIXED_DEPOSIT) {
      accountFilter = { OR: fixedDepositSources.map(sourceEqualsFilter) };
    } else if (account === WalletAccountFilter.INVESTMENT) {
      accountFilter = { OR: investmentSources.map(sourceEqualsFilter) };
    } else if (account === WalletAccountFilter.WALLET) {
      accountFilter = { NOT: nonWalletSources.map(sourceEqualsFilter) };
    }

    // Build where clause for filtering
    const whereClause: Prisma.WalletTransactionWhereInput = {
      walletId,
      ...(type && { type: type as any }),
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(accountFilter && accountFilter),
    };

    // Get total count
    const total = await this.prisma.walletTransaction.count({
      where: whereClause,
    });

    // Get transactions with pagination and sorting
    const transactions = await this.prisma.walletTransaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }, // Latest first
      skip,
      take: limit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage,
          hasPreviousPage,
        },
      },
    };
  }
}
