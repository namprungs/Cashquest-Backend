import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRetirementGoalDto } from '../dto/create-retirement-goal.dto';
import { UpdateRetirementGoalDto } from '../dto/update-retirement-goal.dto';

@Injectable()
export class RetirementGoalService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;

    if (typeof value === 'number') return value;

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      'toNumber' in value &&
      typeof (value as { toNumber: unknown }).toNumber === 'function'
    ) {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private handleError(error: unknown): never {
    if (error instanceof HttpException) throw error;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException({
          success: false,
          message: 'Record not found',
        });
      }
    }

    throw new InternalServerErrorException({
      success: false,
      message: 'Database connection failed or Internal Server Error',
      originalError: (error as any)?.message,
    });
  }

  private async getStudentProfileOrThrow(termId: string, userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId_termId: { userId, termId } },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException({
        success: false,
        message: 'StudentProfile not found for this user in this term',
      });
    }

    return profile;
  }

  private async calculateCurrentAmountFromAssets(studentProfileId: string) {
    const [wallet, savingsAggregate] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: { studentProfileId },
        select: { balance: true },
      }),
      this.prisma.savingsAccount.aggregate({
        where: {
          studentProfileId,
          status: 'ACTIVE',
        },
        _sum: {
          balance: true,
        },
      }),
    ]);

    const walletBalance = this.toNumber(wallet?.balance);
    const savingsBalance = this.toNumber(savingsAggregate._sum.balance);

    return walletBalance + savingsBalance;
  }

  async create(termId: string, userId: string, dto: CreateRetirementGoalDto) {
    try {
      const profile = await this.getStudentProfileOrThrow(termId, userId);
      const currentAmount = await this.calculateCurrentAmountFromAssets(
        profile.id,
      );

      const created = await this.prisma.retirementGoal.create({
        data: {
          studentProfileId: profile.id,
          retirementAge: dto.retirementAge ?? 60,
          monthlyExpense: new Prisma.Decimal(dto.monthlyExpense),
          lifeExpectancy: dto.lifeExpectancy,
          targetAmount: new Prisma.Decimal(dto.targetAmount),
          currentAmount: new Prisma.Decimal(currentAmount),
          ...(dto.targetDate ? { targetDate: new Date(dto.targetDate) } : {}),
        },
      });

      return { success: true, data: created };
    } catch (e) {
      console.log(e);
      this.handleError(e);
    }
  }

  async findAll(termId: string, userId: string) {
    try {
      const profile = await this.getStudentProfileOrThrow(termId, userId);

      const items = await this.prisma.retirementGoal.findMany({
        where: { studentProfileId: profile.id },
        orderBy: { createdAt: 'desc' },
      });

      return { success: true, data: items };
    } catch (e) {
      this.handleError(e);
    }
  }

  async findOne(termId: string, userId: string, id: string) {
    try {
      const item = await this.prisma.retirementGoal.findFirst({
        where: {
          id,
          studentProfile: {
            termId,
            userId,
          },
        },
      });

      if (!item) {
        throw new NotFoundException({
          success: false,
          message: `RetirementGoal with ID ${id} not found`,
        });
      }

      return { success: true, data: item };
    } catch (e) {
      this.handleError(e);
    }
  }

  async update(
    termId: string,
    userId: string,
    id: string,
    dto: UpdateRetirementGoalDto,
  ) {
    try {
      const existing = await this.prisma.retirementGoal.findFirst({
        where: {
          id,
          studentProfile: {
            termId,
            userId,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException({
          success: false,
          message: `RetirementGoal with ID ${id} not found`,
        });
      }

      const profile = await this.getStudentProfileOrThrow(termId, userId);
      const currentAmount = await this.calculateCurrentAmountFromAssets(
        profile.id,
      );

      const hasUpdateField =
        dto.retirementAge !== undefined ||
        dto.monthlyExpense !== undefined ||
        dto.lifeExpectancy !== undefined ||
        dto.targetAmount !== undefined ||
        dto.currentAmount !== undefined ||
        dto.targetDate !== undefined;

      if (!hasUpdateField) {
        throw new BadRequestException({
          success: false,
          message: 'No fields provided for update',
        });
      }

      const data: Prisma.RetirementGoalUpdateInput = {
        ...(dto.retirementAge !== undefined
          ? { retirementAge: dto.retirementAge }
          : {}),
        ...(dto.monthlyExpense !== undefined
          ? { monthlyExpense: new Prisma.Decimal(dto.monthlyExpense) }
          : {}),
        ...(dto.lifeExpectancy !== undefined
          ? { lifeExpectancy: dto.lifeExpectancy }
          : {}),
        ...(dto.targetAmount !== undefined
          ? { targetAmount: new Prisma.Decimal(dto.targetAmount) }
          : {}),
        currentAmount: new Prisma.Decimal(currentAmount),
        ...(dto.targetDate !== undefined
          ? { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }
          : {}),
      };

      const updated = await this.prisma.retirementGoal.update({
        where: { id },
        data,
      });

      return { success: true, data: updated };
    } catch (e) {
      this.handleError(e);
    }
  }

  async remove(termId: string, userId: string, id: string) {
    try {
      const existing = await this.prisma.retirementGoal.findFirst({
        where: {
          id,
          studentProfile: {
            termId,
            userId,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException({
          success: false,
          message: `RetirementGoal with ID ${id} not found`,
        });
      }

      await this.prisma.retirementGoal.delete({ where: { id } });
      return { success: true, data: { id } };
    } catch (e) {
      this.handleError(e);
    }
  }
}
