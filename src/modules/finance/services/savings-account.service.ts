import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QuestService } from 'src/modules/quest/quest.service';
import { CreateSavingsAccountDto } from '../dto/create-savings-account.dto';
import { DepositSavingsDto } from '../dto/deposit-savings.dto';
import { WithdrawSavingsDto } from '../dto/withdraw-savings.dto';
import { WalletService } from './wallet.service';

@Injectable()
export class SavingsAccountService {
  private readonly logger = new Logger(SavingsAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly questService: QuestService,
  ) {}

  /**
   * Open a new savings account
   */
  async openAccount(dto: CreateSavingsAccountDto) {
    // Verify student profile exists
    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentProfileId },
      select: {
        id: true,
        userId: true,
        wallet: { select: { id: true, balance: true } },
      },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found');
    }

    // Verify bank exists
    const bank = await this.prisma.bank.findUnique({
      where: { id: dto.bankId },
      select: { id: true },
    });

    if (!bank) {
      throw new NotFoundException('Bank not found');
    }

    // Check if account already exists for this student + bank combination
    const existingAccount = await this.prisma.savingsAccount.findUnique({
      where: {
        studentProfileId_bankId: {
          studentProfileId: dto.studentProfileId,
          bankId: dto.bankId,
        },
      },
    });

    if (existingAccount && existingAccount.status === 'ACTIVE') {
      throw new BadRequestException(
        'Account already exists for this student at this bank',
      );
    }

    // Create account with optional initial deposit
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.savingsAccount.create({
        data: {
          studentProfileId: dto.studentProfileId,
          bankId: dto.bankId,
          balance: new Prisma.Decimal(dto.initialDeposit ?? 0),
          status: 'ACTIVE',
        },
        include: { bank: true },
      });

      // If there's an initial deposit, record the transaction
      if (dto.initialDeposit && dto.initialDeposit > 0) {
        await tx.savingsTransaction.create({
          data: {
            savingsAccountId: account.id,
            type: 'DEPOSIT',
            amount: new Prisma.Decimal(dto.initialDeposit),
            balanceAfter: account.balance,
          },
        });
      }

      return { success: true, data: account };
    });

    console.log('hahahahahah araiwaaaaa');
    // Trigger interactive quest auto-completion after successful first account open.
    // This should not block the main banking flow if no matching quest exists.
    try {
      const questResult = await this.questService.completeInteractiveQuest(
        studentProfile.userId,
        QuestType.INTERACTIVE,
      );
      console.log('this is ', questResult);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return result;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Interactive quest completion skipped after opening savings account: ${message}`,
      );
    }

    return result;
  }

  /**
   * Deposit from wallet into savings account
   */
  async depositFromWallet(dto: DepositSavingsDto) {
    const depositAmount = new Prisma.Decimal(dto.amount);

    // Verify savings account exists
    const savingsAccount = await this.prisma.savingsAccount.findUnique({
      where: { id: dto.savingsAccountId },
      include: { studentProfile: { select: { wallet: true } }, bank: true },
    });

    if (!savingsAccount) {
      throw new NotFoundException('Savings account not found');
    }

    if (savingsAccount.status !== 'ACTIVE') {
      throw new BadRequestException('Savings account is not active');
    }

    // Verify wallet has sufficient balance
    const wallet = savingsAccount.studentProfile.wallet;
    if (!wallet || wallet.balance.lessThan(depositAmount)) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    // Perform deposit in transaction
    return await this.prisma.$transaction(async (tx) => {
      // 1. Deduct from wallet
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance.minus(depositAmount),
        },
      });

      // 2. Add to savings account
      const updatedAccount = await tx.savingsAccount.update({
        where: { id: dto.savingsAccountId },
        data: {
          balance: savingsAccount.balance.plus(depositAmount),
        },
      });

      // 3. Log wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TRANSFER_OUT',
          amount: depositAmount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          description: `Deposit to savings account at ${savingsAccount.bank.name}`,
          metadata: {
            source: 'SAVINGS_DEPOSIT',
            refId: dto.savingsAccountId,
          },
        },
      });

      // 4. Log savings transaction
      await tx.savingsTransaction.create({
        data: {
          savingsAccountId: dto.savingsAccountId,
          type: 'DEPOSIT',
          amount: depositAmount,
          balanceAfter: updatedAccount.balance,
        },
      });

      return {
        success: true,
        data: {
          savingsAccount: updatedAccount,
          wallet: updatedWallet,
        },
      };
    });
  }

  /**
   * Withdraw from savings account to wallet
   * - Checks withdraw limit per term
   * - Applies transaction fee
   */
  async withdrawToWallet(dto: WithdrawSavingsDto) {
    const withdrawAmount = new Prisma.Decimal(dto.amount);

    // Fetch savings account with all needed relations
    const savingsAccount = await this.prisma.savingsAccount.findUnique({
      where: { id: dto.savingsAccountId },
      include: {
        bank: {
          select: { withdrawLimitPerTerm: true, feePerTransaction: true },
        },
        studentProfile: {
          select: {
            id: true,
            wallet: true,
            term: { select: { id: true } },
          },
        },
      },
    });

    if (!savingsAccount) {
      throw new NotFoundException('Savings account not found');
    }

    if (savingsAccount.status !== 'ACTIVE') {
      throw new BadRequestException('Savings account is not active');
    }

    // Verify sufficient balance in savings
    if (savingsAccount.balance.lessThan(withdrawAmount)) {
      throw new BadRequestException('Insufficient savings account balance');
    }

    // Check withdraw limit
    if (savingsAccount.bank.withdrawLimitPerTerm) {
      if (
        savingsAccount.withdrawCount >= savingsAccount.bank.withdrawLimitPerTerm
      ) {
        throw new BadRequestException(
          `Withdrawal limit of ${savingsAccount.bank.withdrawLimitPerTerm} per term reached`,
        );
      }
    }

    // Calculate fee
    const feeAmount = new Prisma.Decimal(
      savingsAccount.bank.feePerTransaction ?? 0,
    );
    const totalDeduction = withdrawAmount.plus(feeAmount);

    // Verify sufficient balance for amount + fee
    if (savingsAccount.balance.lessThan(totalDeduction)) {
      throw new BadRequestException(
        'Insufficient balance for withdrawal + transaction fee',
      );
    }

    // Ensure wallet exists
    let wallet = savingsAccount.studentProfile.wallet;
    if (!wallet) {
      wallet = await this.walletService.ensureWallet(
        savingsAccount.studentProfile.id,
      );
    }

    // Perform withdrawal in transaction
    return await this.prisma.$transaction(async (tx) => {
      // 1. Deduct from savings account (amount + fee)
      const updatedAccount = await tx.savingsAccount.update({
        where: { id: dto.savingsAccountId },
        data: {
          balance: savingsAccount.balance.minus(totalDeduction),
          withdrawCount: savingsAccount.withdrawCount + 1,
        },
      });

      // 2. Add to wallet (only the amount, not the fee)
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance.plus(withdrawAmount),
        },
      });

      // 3. Log wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TRANSFER_IN',
          amount: withdrawAmount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          description: `Withdrawal from savings account with fee: ${feeAmount.toString()}`,
          metadata: {
            source: 'SAVINGS_WITHDRAW',
            refId: dto.savingsAccountId,
            fee: feeAmount.toString(),
          },
        },
      });

      // 4. Log savings withdrawal transaction
      await tx.savingsTransaction.create({
        data: {
          savingsAccountId: dto.savingsAccountId,
          type: 'WITHDRAW',
          amount: totalDeduction,
          balanceAfter: updatedAccount.balance,
        },
      });

      // 5. Log fee transaction if there's a fee
      if (feeAmount.greaterThan(0)) {
        await tx.savingsTransaction.create({
          data: {
            savingsAccountId: dto.savingsAccountId,
            type: 'FEE',
            amount: feeAmount,
            balanceAfter: updatedAccount.balance,
          },
        });
      }

      return {
        success: true,
        data: {
          savingsAccount: updatedAccount,
          wallet: updatedWallet,
          fee: feeAmount,
          remainingWithdrawals: savingsAccount.bank.withdrawLimitPerTerm
            ? savingsAccount.bank.withdrawLimitPerTerm -
              (savingsAccount.withdrawCount + 1)
            : 'unlimited',
        },
      };
    });
  }

  /**
   * Get savings account details
   */
  async getAccount(accountId: string) {
    const account = await this.prisma.savingsAccount.findUnique({
      where: { id: accountId },
      include: {
        bank: true,
        studentProfile: { select: { id: true, userId: true } },
        interestLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!account) {
      throw new NotFoundException('Savings account not found');
    }

    return { success: true, data: account };
  }

  /**
   * List savings accounts for a student in a term
   */
  async listAccountsByStudent(studentProfileId: string) {
    const accounts = await this.prisma.savingsAccount.findMany({
      where: { studentProfileId },
      include: {
        bank: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (accounts.length === 0) {
      return { success: true, data: [] };
    }

    return { success: true, data: accounts };
  }

  /**
   * Get all savings accounts for a bank
   */
  async listAccountsByBank(bankId: string) {
    const accounts = await this.prisma.savingsAccount.findMany({
      where: { bankId },
      include: {
        studentProfile: {
          select: { user: { select: { username: true, email: true } } },
        },
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: accounts };
  }

  /**
   * Close a savings account
   */
  async closeAccount(accountId: string) {
    const account = await this.prisma.savingsAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Savings account not found');
    }

    if (account.status === 'CLOSED') {
      throw new BadRequestException('Account is already closed');
    }

    // Must have zero balance to close
    if (account.balance.greaterThan(0)) {
      throw new BadRequestException(
        'Cannot close account with remaining balance. Please withdraw all funds first.',
      );
    }

    const closed = await this.prisma.savingsAccount.update({
      where: { id: accountId },
      data: { status: 'CLOSED' },
    });

    return { success: true, data: closed };
  }
}
