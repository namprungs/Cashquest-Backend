import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFixedDepositBankDto } from '../dto/create-fixed-deposit-bank.dto';
import { UpdateFixedDepositBankDto } from '../dto/update-fixed-deposit-bank.dto';

@Injectable()
export class FixedDepositBankService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CREATE
  // ============================================================

  async create(bankId: string, dto: CreateFixedDepositBankDto) {
    const bank = await this.prisma.bank.findUnique({
      where: { id: bankId },
    });

    if (!bank) {
      throw new NotFoundException('Bank not found');
    }

    // 1-to-1 enforcement: each bank can only have one fixed deposit config
    const existingConfig = await this.prisma.fixedDepositBank.findUnique({
      where: { bankId },
    });

    if (existingConfig) {
      throw new ConflictException(
        'This bank already has a fixed deposit config. Use update instead.',
      );
    }

    const config = await this.prisma.fixedDepositBank.create({
      data: {
        bankId,
        interestRate: new Prisma.Decimal(dto.interestRate),
        fixedDepositWeeks: dto.fixedDepositWeeks,
        principal: new Prisma.Decimal(dto.principal),
      },
      include: { bank: true },
    });

    return { success: true, data: config };
  }

  // ============================================================
  // READ
  // ============================================================

  async getById(id: string) {
    const config = await this.prisma.fixedDepositBank.findUnique({
      where: { id },
      include: {
        bank: true,
        fixedDeposits: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!config) {
      throw new NotFoundException('Fixed deposit bank config not found');
    }

    return { success: true, data: config };
  }

  async listByBank(bankId: string) {
    const configs = await this.prisma.fixedDepositBank.findMany({
      where: { bankId },
      include: { bank: true },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: configs };
  }

  async listByTerm(termId: string) {
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

  async update(id: string, dto: UpdateFixedDepositBankDto) {
    const existing = await this.prisma.fixedDepositBank.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Fixed deposit bank config not found');
    }

    const updated = await this.prisma.fixedDepositBank.update({
      where: { id },
      data: {
        ...(dto.interestRate !== undefined && {
          interestRate: new Prisma.Decimal(dto.interestRate),
        }),
        ...(dto.fixedDepositWeeks !== undefined && {
          fixedDepositWeeks: dto.fixedDepositWeeks,
        }),
        ...(dto.principal !== undefined && {
          principal: new Prisma.Decimal(dto.principal),
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
    const existing = await this.prisma.fixedDepositBank.findUnique({
      where: { id },
      include: {
        fixedDeposits: { where: { status: 'ACTIVE' }, take: 1 },
      },
    });

    if (!existing) {
      throw new NotFoundException('Fixed deposit bank config not found');
    }

    if (existing.fixedDeposits.length > 0) {
      throw new Error(
        'Cannot delete fixed deposit bank config with active deposits',
      );
    }

    await this.prisma.fixedDepositBank.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Fixed deposit bank config deleted successfully',
    };
  }
}
