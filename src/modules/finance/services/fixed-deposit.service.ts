import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFixedDepositDto } from '../dto/create-fixed-deposit.dto';
import { WithdrawFixedDepositDto } from '../dto/withdraw-fixed-deposit.dto';
import { WalletService } from './wallet.service';

@Injectable()
export class FixedDepositService {
  private readonly logger = new Logger(FixedDepositService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  async openFixedDeposit(dto: CreateFixedDepositDto) {
    const [studentProfile, fdBank] = await Promise.all([
      this.prisma.studentProfile.findUnique({
        where: { id: dto.studentProfileId },
        include: { term: true, mainWallet: true },
      }),
      this.prisma.fixedDepositBank.findUnique({
        where: { id: dto.fixedDepositBankId },
        include: { bank: true },
      }),
    ]);

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found');
    }

    if (!fdBank) {
      throw new NotFoundException('Fixed deposit bank config not found');
    }

    if (fdBank.bank.termId !== studentProfile.termId) {
      throw new BadRequestException(
        'Bank and student profile must belong to the same term',
      );
    }

    // Auto-calculate startWeekNo from current week
    const startWeekNo = await this.getCurrentWeekNo(studentProfile.termId);
    if (startWeekNo === null) {
      throw new BadRequestException(
        'Unable to determine current week number for this term',
      );
    }

    // Auto-calculate maturityWeekNo from startWeekNo + fixedDepositWeeks
    const maturityWeekNo = startWeekNo + fdBank.fixedDepositWeeks;

    if (maturityWeekNo > 16) {
      throw new BadRequestException(
        `Cannot create fixed deposit: maturity week (${maturityWeekNo}) would exceed week 16. ` +
          `Current week: ${startWeekNo}, deposit duration: ${fdBank.fixedDepositWeeks} weeks`,
      );
    }

    const depositAmount = new Prisma.Decimal(dto.principal);

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.walletService.ensureWalletTx(
        tx,
        dto.studentProfileId,
      );

      if (wallet.balance.lessThan(depositAmount)) {
        throw new BadRequestException(
          'Insufficient wallet balance to open fixed deposit',
        );
      }

      const fixedDeposit = await tx.fixedDeposit.create({
        data: {
          studentProfileId: dto.studentProfileId,
          fixedDepositBankId: dto.fixedDepositBankId,
          principal: depositAmount,
          interestRate: fdBank.interestRate,
          startWeekNo,
          maturityWeekNo,
          status: 'ACTIVE',
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance.minus(depositAmount),
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TRANSFER_OUT',
          amount: depositAmount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          description: `Opened fixed deposit at bank ${fdBank.bank.name}`,
          metadata: {
            source: 'FIXED_DEPOSIT_OPEN',
            refId: fixedDeposit.id,
          },
        },
      });

      await tx.fixedDepositTransaction.create({
        data: {
          fixedDepositId: fixedDeposit.id,
          type: 'OPEN',
          principal: depositAmount,
          interestAmount: new Prisma.Decimal(0),
          amountPaid: new Prisma.Decimal(0),
          description: 'Created fixed deposit',
        },
      });

      return { success: true, data: fixedDeposit };
    });
  }

  async withdrawFixedDeposit(dto: WithdrawFixedDepositDto) {
    const fixedDeposit = await this.prisma.fixedDeposit.findUnique({
      where: { id: dto.fixedDepositId },
      include: {
        studentProfile: { select: { mainWallet: true, termId: true } },
        fixedDepositBank: { include: { bank: { select: { name: true } } } },
      },
    });

    if (!fixedDeposit) {
      throw new NotFoundException('Fixed deposit not found');
    }

    if (fixedDeposit.status !== 'ACTIVE') {
      throw new BadRequestException('Fixed deposit is not active');
    }

    const studentTermId = String(fixedDeposit.studentProfile.termId);
    const currentWeekNo = await this.getCurrentWeekNo(studentTermId);
    const isMatured =
      currentWeekNo !== null && currentWeekNo >= fixedDeposit.maturityWeekNo;

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.walletService.ensureWalletTx(
        tx,
        fixedDeposit.studentProfileId,
      );

      if (isMatured) {
        const term = await tx.term.findUnique({
          where: { id: studentTermId },
          select: { totalWeeks: true },
        });

        const durationWeeks =
          fixedDeposit.maturityWeekNo - fixedDeposit.startWeekNo + 1;
        const interestAmount = this.calculateInterestAmount(
          new Prisma.Decimal(fixedDeposit.principal),
          new Prisma.Decimal(fixedDeposit.interestRate),
          durationWeeks,
          term?.totalWeeks ?? durationWeeks,
        );

        const payoutAmount = new Prisma.Decimal(fixedDeposit.principal).add(
          interestAmount,
        );
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: wallet.balance.plus(payoutAmount) },
        });

        await tx.fixedDeposit.update({
          where: { id: fixedDeposit.id },
          data: { status: 'MATURED' },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'TRANSFER_IN',
            amount: payoutAmount,
            balanceBefore: wallet.balance,
            balanceAfter: updatedWallet.balance,
            description: `Matured fixed deposit payout from bank ${fixedDeposit.fixedDepositBank.bank.name}`,
            metadata: {
              source: 'FIXED_DEPOSIT_MATURITY',
              refId: fixedDeposit.id,
            },
          },
        });

        await tx.fixedDepositTransaction.create({
          data: {
            fixedDepositId: fixedDeposit.id,
            type: 'MATURITY_PAYOUT',
            principal: new Prisma.Decimal(fixedDeposit.principal),
            interestAmount,
            amountPaid: payoutAmount,
            description: 'Matured fixed deposit payout',
          },
        });

        return {
          success: true,
          data: {
            fixedDepositId: fixedDeposit.id,
            status: 'MATURED',
            principal: fixedDeposit.principal,
            interestAmount: interestAmount.toString(),
            amountPaid: payoutAmount.toString(),
            walletBalance: updatedWallet.balance.toString(),
          },
        };
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance.plus(
            new Prisma.Decimal(fixedDeposit.principal),
          ),
        },
      });

      await tx.fixedDeposit.update({
        where: { id: fixedDeposit.id },
        data: { status: 'WITHDRAWN_EARLY' },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TRANSFER_IN',
          amount: new Prisma.Decimal(fixedDeposit.principal),
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          description: `Early withdrawal of fixed deposit from bank ${fixedDeposit.fixedDepositBank.bank.name}`,
          metadata: {
            source: 'FIXED_DEPOSIT_EARLY_WITHDRAWAL',
            refId: fixedDeposit.id,
          },
        },
      });

      await tx.fixedDepositTransaction.create({
        data: {
          fixedDepositId: fixedDeposit.id,
          type: 'EARLY_WITHDRAWAL',
          principal: new Prisma.Decimal(fixedDeposit.principal),
          interestAmount: new Prisma.Decimal(0),
          amountPaid: new Prisma.Decimal(fixedDeposit.principal),
          description: 'Early fixed deposit withdrawal',
        },
      });

      return {
        success: true,
        data: {
          fixedDepositId: fixedDeposit.id,
          status: 'WITHDRAWN_EARLY',
          amountPaid: fixedDeposit.principal,
          walletBalance: updatedWallet.balance.toString(),
        },
      };
    });
  }

  async getFixedDeposit(fixedDepositId: string) {
    const deposit = await this.prisma.fixedDeposit.findUnique({
      where: { id: fixedDepositId },
      include: {
        fixedDepositBank: { include: { bank: true } },
        studentProfile: true,
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!deposit) {
      throw new NotFoundException('Fixed deposit not found');
    }

    return { success: true, data: deposit };
  }

  async listByStudent(studentProfileId: string) {
    const deposits = await this.prisma.fixedDeposit.findMany({
      where: { studentProfileId },
      include: {
        fixedDepositBank: { include: { bank: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: deposits };
  }

  async listByBank(fixedDepositBankId: string) {
    const deposits = await this.prisma.fixedDeposit.findMany({
      where: { fixedDepositBankId },
      include: {
        studentProfile: true,
        transactions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: deposits };
  }

  @Cron('0 0 * * *')
  async processMaturedFixedDeposits() {
    await this.processMaturedFixedDepositsBatch();
  }

  async processMaturedFixedDepositsNow() {
    return this.processMaturedFixedDepositsBatch();
  }

  private async processMaturedFixedDepositsBatch() {
    const now = new Date();
    this.logger.log('Running matured fixed deposit processor');

    const activeTerm = await this.prisma.term.findFirst({
      where: {
        status: 'ONGOING',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: { id: true, totalWeeks: true },
    });

    if (!activeTerm) {
      this.logger.debug(
        'No active term found, skipping fixed deposit maturity processing',
      );
      return {
        success: true,
        processed: 0,
        maturedDeposits: 0,
        message: 'No active term found',
      };
    }

    const currentWeekNo = await this.getCurrentWeekNo(activeTerm.id);
    if (currentWeekNo === null) {
      this.logger.warn(
        'Unable to determine current week number for active term',
      );
      return {
        success: false,
        processed: 0,
        maturedDeposits: 0,
        message: 'Unable to determine current week number',
      };
    }

    const maturedDeposits = await this.prisma.fixedDeposit.findMany({
      where: {
        status: 'ACTIVE',
        studentProfile: { termId: activeTerm.id },
        maturityWeekNo: { lte: currentWeekNo },
      },
      include: {
        studentProfile: { select: { mainWallet: true, termId: true } },
        fixedDepositBank: { include: { bank: { select: { name: true } } } },
      },
    });

    if (!maturedDeposits.length) {
      this.logger.log('No matured fixed deposits to process today');
      return {
        success: true,
        processed: 0,
        maturedDeposits: 0,
        message: 'No matured fixed deposits to process today',
      };
    }

    let processed = 0;
    let failed = 0;

    for (const deposit of maturedDeposits) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const wallet = await this.walletService.ensureWalletTx(
            tx,
            deposit.studentProfileId,
          );

          const durationWeeks =
            deposit.maturityWeekNo - deposit.startWeekNo + 1;
          const interestAmount = this.calculateInterestAmount(
            new Prisma.Decimal(deposit.principal),
            new Prisma.Decimal(deposit.interestRate),
            durationWeeks,
            activeTerm.totalWeeks,
          );

          const payoutAmount = new Prisma.Decimal(deposit.principal).add(
            interestAmount,
          );

          const updatedWallet = await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: wallet.balance.plus(payoutAmount) },
          });

          await tx.fixedDeposit.update({
            where: { id: deposit.id },
            data: { status: 'MATURED' },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'TRANSFER_IN',
              amount: payoutAmount,
              balanceBefore: wallet.balance,
              balanceAfter: updatedWallet.balance,
              description: `Matured fixed deposit payout from bank ${deposit.fixedDepositBank.bank.name}`,
              metadata: {
                source: 'FIXED_DEPOSIT_MATURITY',
                refId: deposit.id,
              },
            },
          });

          await tx.fixedDepositTransaction.create({
            data: {
              fixedDepositId: deposit.id,
              type: 'MATURITY_PAYOUT',
              principal: new Prisma.Decimal(deposit.principal),
              interestAmount,
              amountPaid: payoutAmount,
              description: 'Matured fixed deposit payout',
            },
          });
        });

        processed += 1;
        this.logger.log(`Processed matured fixed deposit ${deposit.id}`);
      } catch (error: unknown) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed to process matured fixed deposit ${deposit.id}: ${message}`,
          stack,
        );
      }
    }

    return {
      success: failed === 0,
      processed,
      maturedDeposits: maturedDeposits.length,
      failed,
      currentWeekNo,
    };
  }

  private async getCurrentWeekNo(termId: string): Promise<number | null> {
    const now = new Date();
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      include: {
        termWeeks: {
          orderBy: { weekNo: 'asc' },
        },
      },
    });

    if (!term || !term.termWeeks?.length) {
      return null;
    }

    const currentDateString = this.formatLocalDate(now);
    const currentWeek = term.termWeeks.find((week) => {
      const startDateString = this.formatLocalDate(new Date(week.startDate));
      const endDateString = this.formatLocalDate(new Date(week.endDate));
      return (
        currentDateString >= startDateString &&
        currentDateString <= endDateString
      );
    });

    if (currentWeek) {
      return currentWeek.weekNo;
    }

    if (now < term.termWeeks[0].startDate) {
      return 1;
    }

    return term.termWeeks[term.termWeeks.length - 1].weekNo;
  }

  private calculateInterestAmount(
    principal: Prisma.Decimal,
    interestRate: Prisma.Decimal,
    durationWeeks: number,
    termTotalWeeks: number,
  ) {
    if (durationWeeks <= 0 || termTotalWeeks <= 0) {
      return new Prisma.Decimal(0);
    }

    return principal
      .mul(interestRate)
      .mul(new Prisma.Decimal(durationWeeks))
      .div(new Prisma.Decimal(termTotalWeeks))
      .toDecimalPlaces(2);
  }

  private formatLocalDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )}`;
  }

  // ============================================================
  // ADDITIONAL CRUD OPERATIONS
  // ============================================================

  /**
   * Get all fixed deposits for a fixed deposit bank config
   */
  async listAllByBank(fixedDepositBankId: string) {
    const deposits = await this.prisma.fixedDeposit.findMany({
      where: { fixedDepositBankId },
      include: {
        studentProfile: {
          select: { id: true, user: { select: { username: true } } },
        },
        fixedDepositBank: { include: { bank: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: deposits };
  }

  /**
   * Get fixed deposit statistics for a fixed deposit bank config
   */
  async getBankStatistics(fixedDepositBankId: string) {
    const fdBank = await this.prisma.fixedDepositBank.findUnique({
      where: { id: fixedDepositBankId },
      include: {
        bank: true,
        fixedDeposits: true,
      },
    });

    if (!fdBank) {
      throw new NotFoundException('Fixed deposit bank config not found');
    }

    const stats = {
      totalDeposits: fdBank.fixedDeposits.length,
      activeDeposits: fdBank.fixedDeposits.filter((d) => d.status === 'ACTIVE')
        .length,
      maturedDeposits: fdBank.fixedDeposits.filter(
        (d) => d.status === 'MATURED',
      ).length,
      earlyWithdrawals: fdBank.fixedDeposits.filter(
        (d) => d.status === 'WITHDRAWN_EARLY',
      ).length,
      totalPrincipal: fdBank.fixedDeposits.reduce(
        (sum, d) => sum.plus(d.principal),
        new Prisma.Decimal(0),
      ),
    };

    return {
      success: true,
      data: {
        bank: { id: fdBank.bank.id, name: fdBank.bank.name },
        statistics: stats,
      },
    };
  }

  /**
   * Close an active fixed deposit (mark as closed, not early withdrawal)
   */
  async closeFixedDeposit(fixedDepositId: string) {
    const deposit = await this.prisma.fixedDeposit.findUnique({
      where: { id: fixedDepositId },
    });

    if (!deposit) {
      throw new NotFoundException('Fixed deposit not found');
    }

    if (deposit.status !== 'ACTIVE') {
      throw new BadRequestException('Can only close active fixed deposits');
    }

    const closed = await this.prisma.fixedDeposit.update({
      where: { id: fixedDepositId },
      data: { status: 'WITHDRAWN_EARLY' },
    });

    return { success: true, data: closed };
  }
}
