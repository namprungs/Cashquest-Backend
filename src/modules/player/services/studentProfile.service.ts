import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TermStatus } from '@prisma/client';
import { WalletService } from 'src/modules/finance/services/wallet.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PlayerService {
  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  async bootstrap(termId: string, userId: string) {
    // optional: term ต้อง ONGOING ถึงจะเริ่มเล่น
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, status: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    // แล้วแต่ design: จะ allow DRAFT ไหม
    if (term.status === TermStatus.COMPLETED) {
      throw new BadRequestException('Term already completed');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) StudentProfile upsert (idempotent)
      const studentProfile = await tx.studentProfile.upsert({
        where: { userId_termId: { userId, termId } },
        update: {},
        create: { userId, termId },
      });

      // 2) Wallet ensure (idempotent)
      const wallet = await this.walletService.ensureWalletTx(
        tx,
        studentProfile.id,
      );

      return { studentProfile, wallet };
    });

    return { success: true, data: result };
  }

  // List all student profiles in a term
  async getAllByTerm(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    const profiles = await this.prisma.studentProfile.findMany({
      where: { termId },
      include: {
        user: { select: { id: true, username: true, email: true } },
        wallet: { select: { balance: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, data: profiles };
  }

  // Get student profile by id
  async getById(id: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true } },
        wallet: { select: { balance: true } },
        term: { select: { id: true, name: true, status: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException('StudentProfile not found');
    }

    return { success: true, data: profile };
  }
}
