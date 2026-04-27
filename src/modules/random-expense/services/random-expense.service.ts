import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { WalletService } from '../../finance/services/wallet.service';
import {
  GetPendingExpensesDto,
  GetExpenseHistoryDto,
  PayExpenseDto,
  TriggerWeeklyExpenseDto,
} from '../dto/expense-query.dto';

@Injectable()
export class RandomExpenseService {
  private readonly logger = new Logger(RandomExpenseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  // ──────────────────────────────────────────────
  //  CORE: Generate random expenses for all students
  // ──────────────────────────────────────────────

  /**
   * Trigger weekly random expense generation for a given term and week number.
   * For each student profile in the term, determine their current life stage,
   * pick a random expense event, and attempt auto-payment from wallet.
   */
  async triggerWeeklyExpenses(dto: TriggerWeeklyExpenseDto): Promise<{
    processed: number;
    paid: number;
    unpaid: number;
    errors: string[];
  }> {
    const { termId, weekNo } = dto;

    // Determine the current week number if not provided
    const week = weekNo ?? (await this.getCurrentWeekNo(termId));
    if (!week) {
      throw new BadRequestException(
        'Cannot determine current week number for the given term',
      );
    }

    this.logger.log(
      `Triggering weekly expenses for term ${termId}, week ${week}`,
    );

    // Get the current life stage rule for this week
    const stageRule = await this.prisma.termStageRule.findFirst({
      where: {
        termId,
        startWeek: { lte: week },
        endWeek: { gte: week },
      },
      include: { lifeStage: true },
      orderBy: { startWeek: 'desc' },
    });

    if (!stageRule) {
      throw new NotFoundException(
        `No life stage rule found for term ${termId} at week ${week}`,
      );
    }

    if (!stageRule.lifeStage.enableRandomExpense) {
      this.logger.log(
        `Random expense is disabled for life stage "${stageRule.lifeStage.name}" (week ${week}). Skipping.`,
      );
      return { processed: 0, paid: 0, unpaid: 0, errors: [] };
    }

    // Get all student profiles for this term
    const studentProfiles = await this.prisma.studentProfile.findMany({
      where: { termId },
      select: { id: true },
    });

    // Get available expense events for this term and life stage
    const expenseEvents = await this.prisma.expenseEvent.findMany({
      where: {
        termId,
        lifeStageId: stageRule.lifeStageId,
        isActive: true,
      },
    });

    if (expenseEvents.length === 0) {
      this.logger.warn(
        `No expense events found for term ${termId}, life stage ${stageRule.lifeStageId}`,
      );
      return { processed: 0, paid: 0, unpaid: 0, errors: [] };
    }

    let processed = 0;
    let paid = 0;
    let unpaid = 0;
    const errors: string[] = [];

    for (const profile of studentProfiles) {
      try {
        // Check which events this student already has this week (avoid duplicates)
        const existingExpenses = await this.prisma.studentExpense.findMany({
          where: {
            studentProfileId: profile.id,
            weekNo: week,
          },
          select: { expenseEventId: true },
        });

        const usedEventIds = new Set(
          existingExpenses.map((e) => e.expenseEventId),
        );

        // Filter out already-assigned events
        const availableEvents = expenseEvents.filter(
          (e) => !usedEventIds.has(e.id),
        );

        if (availableEvents.length === 0) {
          this.logger.debug(
            `Student profile ${profile.id}: all events already assigned for week ${week}. Skipping.`,
          );
          continue;
        }

        // Pick a random event
        const randomIndex = Math.floor(Math.random() * availableEvents.length);
        const selectedEvent = availableEvents[randomIndex];

        // Vary amount by ±10% for randomness
        const baseAmount = new Prisma.Decimal(selectedEvent.baseAmount);
        const varianceFactor = new Prisma.Decimal(0.9 + Math.random() * 0.2); // 0.9 to 1.1
        const amount = baseAmount.mul(varianceFactor).toDecimalPlaces(2);

        // Create the student expense and attempt auto-payment
        const result = await this.createStudentExpense(
          profile.id,
          termId,
          selectedEvent.id,
          week,
          amount,
        );

        processed++;
        if (result.status === 'PAID') {
          paid++;
        } else {
          unpaid++;
        }
      } catch (error) {
        const errMsg = `Failed for student profile ${profile.id}: ${error.message}`;
        this.logger.error(errMsg);
        errors.push(errMsg);
      }
    }

    this.logger.log(
      `Weekly expenses completed: processed=${processed}, paid=${paid}, unpaid=${unpaid}`,
    );

    return { processed, paid, unpaid, errors };
  }

  /**
   * Create a student expense and attempt auto-payment from wallet.
   * Returns the created expense with updated status.
   */
  private async createStudentExpense(
    studentProfileId: string,
    termId: string,
    expenseEventId: string,
    weekNo: number,
    amount: Prisma.Decimal,
  ): Promise<{
    id: string;
    status: string;
    remainingAmount: Prisma.Decimal;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // Create the student expense
      const studentExpense = await tx.studentExpense.create({
        data: {
          studentProfileId,
          termId,
          expenseEventId,
          weekNo,
          amount,
          remainingAmount: amount,
          status: 'UNPAID',
        },
      });

      // Attempt auto-payment from wallet
      const wallet = await tx.wallet.findUnique({
        where: { studentProfileId },
      });

      if (wallet && wallet.balance.gte(amount)) {
        // Sufficient funds - deduct from wallet
        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore.sub(amount);

        // Update wallet balance
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });

        // Record wallet transaction
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'FINE_PAYMENT',
            amount: amount.neg(), // negative for expense
            balanceBefore,
            balanceAfter,
            metadata: {
              source: 'RANDOM_EXPENSE',
              studentExpenseId: studentExpense.id,
              expenseEventId,
              weekNo,
            },
            description: `ค่าใช้จ่ายสุ่มประจำสัปดาห์ที่ ${weekNo}`,
          },
        });

        // Record payment
        await tx.expensePayment.create({
          data: {
            studentExpenseId: studentExpense.id,
            sourceType: 'WALLET',
            amount,
            sourceRef: wallet.id,
          },
        });

        // Update expense status to PAID
        const updated = await tx.studentExpense.update({
          where: { id: studentExpense.id },
          data: {
            status: 'PAID',
            remainingAmount: new Prisma.Decimal(0),
          },
        });

        return {
          id: updated.id,
          status: 'PAID',
          remainingAmount: updated.remainingAmount,
        };
      }

      // Insufficient funds - leave as UNPAID
      return {
        id: studentExpense.id,
        status: 'UNPAID',
        remainingAmount: amount,
      };
    });
  }

  // ──────────────────────────────────────────────
  //  API: Get pending expenses for a student
  // ──────────────────────────────────────────────

  async getPendingExpenses(
    studentProfileId: string,
    dto: GetPendingExpensesDto,
  ) {
    const { termId, weekNo, page = 1, limit = 20 } = dto;

    const where: Prisma.StudentExpenseWhereInput = {
      studentProfileId,
      termId,
      status: { in: ['UNPAID', 'PARTIAL'] },
      ...(weekNo && { weekNo }),
    };

    const [items, total] = await Promise.all([
      this.prisma.studentExpense.findMany({
        where,
        include: {
          expenseEvent: {
            select: {
              id: true,
              title: true,
              description: true,
              iconUrl: true,
              baseAmount: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.studentExpense.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────
  //  API: Get expense history for a student
  // ──────────────────────────────────────────────

  async getExpenseHistory(studentProfileId: string, dto: GetExpenseHistoryDto) {
    const { termId, weekNo, page = 1, limit = 20 } = dto;

    const where: Prisma.StudentExpenseWhereInput = {
      studentProfileId,
      termId,
      status: 'PAID',
      ...(weekNo && { weekNo }),
    };

    const [items, total] = await Promise.all([
      this.prisma.studentExpense.findMany({
        where,
        include: {
          expenseEvent: {
            select: {
              id: true,
              title: true,
              description: true,
              iconUrl: true,
              baseAmount: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.studentExpense.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────
  //  API: Pay an unpaid expense
  // ──────────────────────────────────────────────

  async payExpense(studentProfileId: string, dto: PayExpenseDto) {
    const { studentExpenseId, sourceType = 'WALLET', sourceRef } = dto;

    const expense = await this.prisma.studentExpense.findUnique({
      where: { id: studentExpenseId },
      include: { expenseEvent: true },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (expense.studentProfileId !== studentProfileId) {
      throw new BadRequestException('This expense does not belong to you');
    }

    if (expense.status === 'PAID') {
      throw new BadRequestException('This expense has already been paid');
    }

    if (expense.remainingAmount.lte(0)) {
      throw new BadRequestException('No remaining amount to pay');
    }

    return this.prisma.$transaction(async (tx) => {
      const remainingAmount = new Prisma.Decimal(expense.remainingAmount);
      const amountToPay = remainingAmount; // Pay in full

      if (sourceType === 'WALLET') {
        const wallet = await tx.wallet.findUnique({
          where: { studentProfileId },
        });

        if (!wallet) {
          throw new NotFoundException('Wallet not found');
        }

        if (wallet.balance.lt(amountToPay)) {
          throw new BadRequestException(
            `Insufficient wallet balance. Need ${amountToPay.toString()}, have ${wallet.balance.toString()}`,
          );
        }

        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore.sub(amountToPay);

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'FINE_PAYMENT',
            amount: amountToPay.neg(),
            balanceBefore,
            balanceAfter,
            metadata: {
              source: 'RANDOM_EXPENSE_PAYMENT',
              studentExpenseId,
              weekNo: expense.weekNo,
            },
            description: `ชำระค่าใช้จ่ายสุ่ม: ${expense.expenseEvent.title}`,
          },
        });

        await tx.expensePayment.create({
          data: {
            studentExpenseId,
            sourceType: 'WALLET',
            amount: amountToPay,
            sourceRef: wallet.id,
          },
        });
      } else if (sourceType === 'SAVINGS') {
        if (!sourceRef) {
          throw new BadRequestException(
            'sourceRef (savingsAccountId) is required for savings payment',
          );
        }

        const savingsAccount = await tx.savingsAccount.findUnique({
          where: { id: sourceRef },
        });

        if (!savingsAccount) {
          throw new NotFoundException('Savings account not found');
        }

        if (savingsAccount.studentProfileId !== studentProfileId) {
          throw new BadRequestException(
            'This savings account does not belong to you',
          );
        }

        if (savingsAccount.balance.lt(amountToPay)) {
          throw new BadRequestException(
            `Insufficient savings balance. Need ${amountToPay.toString()}, have ${savingsAccount.balance.toString()}`,
          );
        }

        const balanceAfter = new Prisma.Decimal(savingsAccount.balance).sub(
          amountToPay,
        );

        await tx.savingsAccount.update({
          where: { id: sourceRef },
          data: { balance: balanceAfter },
        });

        await tx.savingsTransaction.create({
          data: {
            savingsAccountId: sourceRef,
            type: 'WITHDRAW',
            amount: amountToPay,
            balanceAfter,
          },
        });

        await tx.expensePayment.create({
          data: {
            studentExpenseId,
            sourceType: 'SAVINGS',
            amount: amountToPay,
            sourceRef,
          },
        });
      }

      // Update expense status
      const updatedExpense = await tx.studentExpense.update({
        where: { id: studentExpenseId },
        data: {
          status: 'PAID',
          remainingAmount: new Prisma.Decimal(0),
        },
        include: {
          expenseEvent: true,
          payments: true,
        },
      });

      return updatedExpense;
    });
  }

  // ──────────────────────────────────────────────
  //  API: Get all expenses for a student (both paid and unpaid)
  // ──────────────────────────────────────────────

  async getAllExpenses(
    studentProfileId: string,
    termId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const where: Prisma.StudentExpenseWhereInput = {
      studentProfileId,
      termId,
    };

    const [items, total] = await Promise.all([
      this.prisma.studentExpense.findMany({
        where,
        include: {
          expenseEvent: {
            select: {
              id: true,
              title: true,
              description: true,
              iconUrl: true,
              baseAmount: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.studentExpense.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────
  //  HELPERS
  // ──────────────────────────────────────────────

  /**
   * Determine current week number for a given term based on today's date.
   * Fallback: if no TermWeek covers today, use the latest weekNo that has expenses.
   */
  private async getCurrentWeekNo(termId: string): Promise<number | null> {
    // 1) Try to find the TermWeek that covers today
    const termWeek = await this.prisma.termWeek.findFirst({
      where: {
        termId,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      select: { weekNo: true },
    });

    if (termWeek) return termWeek.weekNo;

    // 2) Fallback: find the latest weekNo that actually has student expenses
    const latestExpense = await this.prisma.studentExpense.findFirst({
      where: { termId },
      orderBy: { weekNo: 'desc' },
      select: { weekNo: true },
    });

    return latestExpense?.weekNo ?? null;
  }

  /**
   * Get summary stats for a student's expenses in a term.
   */
  async getExpenseSummary(studentProfileId: string, termId: string) {
    const [totalExpenses, unpaidCount, totalUnpaid, totalPaid] =
      await Promise.all([
        this.prisma.studentExpense.count({
          where: { studentProfileId, termId },
        }),
        this.prisma.studentExpense.count({
          where: { studentProfileId, termId, status: 'UNPAID' },
        }),
        this.prisma.studentExpense.aggregate({
          where: {
            studentProfileId,
            termId,
            status: { in: ['UNPAID', 'PARTIAL'] },
          },
          _sum: { remainingAmount: true },
        }),
        this.prisma.studentExpense.aggregate({
          where: { studentProfileId, termId, status: 'PAID' },
          _sum: { amount: true },
        }),
      ]);

    return {
      totalExpenses,
      unpaidCount,
      totalUnpaidAmount:
        totalUnpaid._sum.remainingAmount ?? new Prisma.Decimal(0),
      totalPaidAmount: totalPaid._sum.amount ?? new Prisma.Decimal(0),
    };
  }

  // ──────────────────────────────────────────────
  //  API: Get unacknowledged paid expenses (for home page dialog)
  // ──────────────────────────────────────────────

  /**
   * Get paid expenses that the student hasn't acknowledged yet.
   * These are auto-paid expenses the student hasn't been notified about.
   */
  async getUnacknowledgedExpenses(studentProfileId: string, termId: string) {
    return await this.prisma.studentExpense.findMany({
      where: {
        studentProfileId,
        termId,
        status: 'PAID',
        acknowledgedAt: null,
      },
      include: {
        expenseEvent: {
          select: {
            id: true,
            title: true,
            description: true,
            iconUrl: true,
            baseAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Acknowledge (mark as seen) a specific expense.
   * Returns the wallet balance after acknowledging.
   */
  async acknowledgeExpense(studentProfileId: string, studentExpenseId: string) {
    const expense = await this.prisma.studentExpense.findUnique({
      where: { id: studentExpenseId },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (expense.studentProfileId !== studentProfileId) {
      throw new BadRequestException('This expense does not belong to you');
    }

    const updated = await this.prisma.studentExpense.update({
      where: { id: studentExpenseId },
      data: { acknowledgedAt: new Date() },
    });

    // Also get the wallet balance for the dialog
    const wallet = await this.prisma.wallet.findUnique({
      where: { studentProfileId },
      select: { balance: true },
    });

    return {
      ...updated,
      walletBalance: wallet?.balance ?? new Prisma.Decimal(0),
    };
  }

  /**
   * Acknowledge all unacknowledged expenses for a student in a term.
   */
  async acknowledgeAllExpenses(studentProfileId: string, termId: string) {
    const result = await this.prisma.studentExpense.updateMany({
      where: {
        studentProfileId,
        termId,
        status: 'PAID',
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: new Date() },
    });

    const wallet = await this.prisma.wallet.findUnique({
      where: { studentProfileId },
      select: { balance: true },
    });

    return {
      acknowledgedCount: result.count,
      walletBalance: wallet?.balance ?? new Prisma.Decimal(0),
    };
  }

  /**
   * Get current week expenses for home page preview.
   * Returns both pending and recently-paid expenses for the current week.
   */
  async getCurrentWeekExpenses(studentProfileId: string, termId: string) {
    const currentWeekNo = await this.getCurrentWeekNo(termId);

    if (!currentWeekNo) {
      return { weekNo: null, items: [] };
    }

    const items = await this.prisma.studentExpense.findMany({
      where: {
        studentProfileId,
        termId,
        weekNo: currentWeekNo,
      },
      include: {
        expenseEvent: {
          select: {
            id: true,
            title: true,
            description: true,
            iconUrl: true,
            baseAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { weekNo: currentWeekNo, items };
  }

  /**
   * Get wallet balance for a student profile.
   */
  async getWalletBalance(studentProfileId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { studentProfileId },
      select: { balance: true },
    });
    return wallet?.balance ?? new Prisma.Decimal(0);
  }
}
