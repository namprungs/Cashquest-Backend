import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateBankDto } from '../dto/create-bank.dto';
import { UpdateBankDto } from '../dto/update-bank.dto';

@Injectable()
export class BankService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CREATE
  // ============================================================

  async createBank(dto: CreateBankDto) {
    const term = await this.prisma.term.findUnique({
      where: { id: dto.termId },
      select: { id: true },
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }

    const bank = await this.prisma.bank.create({
      data: {
        termId: dto.termId,
        name: dto.name,
      },
    });

    return { success: true, data: bank };
  }

  // ============================================================
  // READ
  // ============================================================

  async getBank(bankId: string) {
    const bank = await this.prisma.bank.findUnique({
      where: { id: bankId },
      include: {
        term: { select: { id: true, name: true } },
        savingsAccountBank: true,
        fixedDepositBank: true,
      },
    });

    if (!bank) {
      throw new NotFoundException('Bank not found');
    }

    return { success: true, data: bank };
  }

  async listBanksByTerm(termId: string) {
    const banks = await this.prisma.bank.findMany({
      where: { termId },
      include: {
        savingsAccountBank: true,
        fixedDepositBank: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: banks };
  }

  /**
   * List banks that have at least one SavingsAccountBank config in a term
   */
  async listSavingsAccountBanks(termId: string) {
    const configs = await this.prisma.savingsAccountBank.findMany({
      where: { bank: { termId } },
      include: { bank: true },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: configs };
  }

  /**
   * List banks that have at least one FixedDepositBank config in a term
   */
  async listFixedDepositBanks(termId: string) {
    const configs = await this.prisma.fixedDepositBank.findMany({
      where: { bank: { termId } },
      include: { bank: true },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: configs };
  }

  // ============================================================
  // UPDATE
  // ============================================================

  async updateBank(bankId: string, dto: UpdateBankDto) {
    const existing = await this.prisma.bank.findUnique({
      where: { id: bankId },
    });

    if (!existing) {
      throw new NotFoundException('Bank not found');
    }

    const updated = await this.prisma.bank.update({
      where: { id: bankId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });

    return { success: true, data: updated };
  }

  // ============================================================
  // DELETE
  // ============================================================

  async deleteBank(bankId: string) {
    const existing = await this.prisma.bank.findUnique({
      where: { id: bankId },
      include: {
        savingsAccountBank: {
          include: { savingsAccounts: { where: { status: 'ACTIVE' }, take: 1 } },
        },
        fixedDepositBank: {
          include: { fixedDeposits: { where: { status: 'ACTIVE' }, take: 1 } },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Bank not found');
    }

    // Check if any service config has active accounts
    const hasActiveSavings =
      existing.savingsAccountBank !== null &&
      existing.savingsAccountBank.savingsAccounts.length > 0;
    const hasActiveFD =
      existing.fixedDepositBank !== null &&
      existing.fixedDepositBank.fixedDeposits.length > 0;

    if (hasActiveSavings || hasActiveFD) {
      throw new Error('Cannot delete bank with active accounts');
    }

    await this.prisma.bank.delete({
      where: { id: bankId },
    });

    return { success: true, message: 'Bank deleted successfully' };
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  async getBankStatistics(bankId: string) {
    const bank = await this.prisma.bank.findUnique({
      where: { id: bankId },
      include: {
        savingsAccountBank: {
          include: { savingsAccounts: true },
        },
        fixedDepositBank: {
          include: { fixedDeposits: true },
        },
      },
    });

    if (!bank) {
      throw new NotFoundException('Bank not found');
    }

    const savingsAccounts = bank.savingsAccountBank?.savingsAccounts ?? [];
    const fixedDeposits = bank.fixedDepositBank?.fixedDeposits ?? [];

    return {
      success: true,
      data: {
        bank: { id: bank.id, name: bank.name },
        savingsAccount: {
          totalAccounts: savingsAccounts.length,
          activeAccounts: savingsAccounts.filter((a) => a.status === 'ACTIVE').length,
        },
        fixedDeposit: {
          totalDeposits: fixedDeposits.length,
          activeDeposits: fixedDeposits.filter((d) => d.status === 'ACTIVE').length,
          maturedDeposits: fixedDeposits.filter((d) => d.status === 'MATURED').length,
        },
      },
    };
  }
}
