import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSavingsAccountBankDto } from '../dto/create-savings-account-bank.dto';
import { UpdateSavingsAccountBankDto } from '../dto/update-savings-account-bank.dto';

@Injectable()
export class SavingsAccountBankService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CREATE
  // ============================================================

  async create(bankId: string, dto: CreateSavingsAccountBankDto) {
    const bank = await this.prisma.bank.findUnique({
      where: { id: bankId },
    });

    if (!bank) {
      throw new NotFoundException('Bank not found');
    }

    // 1-to-1 enforcement: each bank can only have one savings account config
    const existingConfig = await this.prisma.savingsAccountBank.findUnique({
      where: { bankId },
    });

    if (existingConfig) {
      throw new ConflictException(
        'This bank already has a savings account config. Use update instead.',
      );
    }

    const config = await this.prisma.savingsAccountBank.create({
      data: {
        bankId,
        interestRate: new Prisma.Decimal(dto.interestRate),
        withdrawLimitPerTerm: dto.withdrawLimitPerTerm ?? 2000,
        feePerTransaction: new Prisma.Decimal(dto.feePerTransaction ?? 0),
      },
      include: { bank: true },
    });

    return { success: true, data: config };
  }

  // ============================================================
  // READ
  // ============================================================

  async getById(id: string) {
    const config = await this.prisma.savingsAccountBank.findUnique({
      where: { id },
      include: {
        bank: true,
        savingsAccounts: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!config) {
      throw new NotFoundException('Savings account bank config not found');
    }

    return { success: true, data: config };
  }

  async listByBank(bankId: string) {
    const configs = await this.prisma.savingsAccountBank.findMany({
      where: { bankId },
      include: { bank: true },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: configs };
  }

  async listByTerm(termId: string) {
    const configs = await this.prisma.savingsAccountBank.findMany({
      where: { bank: { termId } },
      include: { bank: true },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: configs };
  }

  // ============================================================
  // UPDATE
  // ============================================================

  async update(id: string, dto: UpdateSavingsAccountBankDto) {
    const existing = await this.prisma.savingsAccountBank.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Savings account bank config not found');
    }

    const updated = await this.prisma.savingsAccountBank.update({
      where: { id },
      data: {
        ...(dto.interestRate !== undefined && {
          interestRate: new Prisma.Decimal(dto.interestRate),
        }),
        ...(dto.withdrawLimitPerTerm !== undefined && {
          withdrawLimitPerTerm: dto.withdrawLimitPerTerm,
        }),
        ...(dto.feePerTransaction !== undefined && {
          feePerTransaction: new Prisma.Decimal(dto.feePerTransaction),
        }),
      },
      include: { bank: true },
    });

    return { success: true, data: updated };
  }

  // ============================================================
  // DELETE
  // ============================================================

  async remove(id: string) {
    const existing = await this.prisma.savingsAccountBank.findUnique({
      where: { id },
      include: {
        savingsAccounts: { where: { status: 'ACTIVE' }, take: 1 },
      },
    });

    if (!existing) {
      throw new NotFoundException('Savings account bank config not found');
    }

    if (existing.savingsAccounts.length > 0) {
      throw new Error(
        'Cannot delete savings account bank config with active accounts',
      );
    }

    await this.prisma.savingsAccountBank.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Savings account bank config deleted successfully',
    };
  }
}
