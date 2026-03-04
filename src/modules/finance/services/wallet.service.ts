import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

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

    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const whereClause: Prisma.WalletTransactionWhereInput = {
      walletId,
      ...(type && { type: type as any }),
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
