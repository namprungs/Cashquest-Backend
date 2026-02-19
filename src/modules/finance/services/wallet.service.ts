import { Injectable } from '@nestjs/common';
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
}
