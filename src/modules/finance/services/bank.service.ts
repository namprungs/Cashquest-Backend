import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateBankDto } from '../dto/create-bank.dto';
import { UpdateBankDto } from '../dto/update-bank.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class BankService {
  constructor(private readonly prisma: PrismaService) {}

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
        interestRate: new Prisma.Decimal(dto.interestRate),
        withdrawLimitPerTerm: dto.withdrawLimitPerTerm,
        feePerTransaction: new Prisma.Decimal(
          dto.feePerTransaction ?? 0,
        ),
      },
    });

    return { success: true, data: bank };
  }

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
    });

    return { success: true, data: updated };
  }

  async listBanksByTerm(termId: string) {
    const banks = await this.prisma.bank.findMany({
      where: { termId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: banks };
  }
}