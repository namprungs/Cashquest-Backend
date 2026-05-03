import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRetirementGoalDto } from '../dto/create-retirement-goal.dto';
import { UpdateRetirementGoalDto } from '../dto/update-retirement-goal.dto';
import { toNumber } from 'src/common/utils/number.utils';

@Injectable()
export class RetirementGoalService {
  private readonly logger = new Logger(RetirementGoalService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toNumber = toNumber;

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
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: {
        termId: true,
        mainWallet: { select: { balance: true } },
        investmentWallet: { select: { balance: true } },
      },
    });

    const walletBalance = this.toNumber(profile?.mainWallet?.balance);
    const investmentBalance = this.toNumber(profile?.investmentWallet?.balance);

    const [savingsAggregate, fdAggregate, holdings] = await Promise.all([
      this.prisma.savingsAccount.aggregate({
        where: {
          studentProfileId,
          status: 'ACTIVE',
        },
        _sum: {
          balance: true,
        },
      }),
      this.prisma.fixedDeposit.aggregate({
        where: {
          studentProfileId,
          status: 'ACTIVE',
        },
        _sum: {
          principal: true,
        },
      }),
      this.prisma.holding.findMany({
        where: {
          studentProfileId,
          termId: profile?.termId,
          units: {
            gt: 0,
          },
        },
        select: {
          productId: true,
          units: true,
          avgCost: true,
        },
      }),
    ]);

    const savingsBalance = this.toNumber(savingsAggregate._sum.balance);
    const fdBalance = this.toNumber(fdAggregate._sum.principal);
    const productIds = holdings.map((holding) => holding.productId);
    const [latestPrices, latestLiveTicks] =
      profile?.termId && productIds.length
        ? await Promise.all([
            this.prisma.productPrice.findMany({
              where: {
                termId: profile.termId,
                productId: {
                  in: productIds,
                },
              },
              orderBy: [{ weekNo: 'desc' }, { createdAt: 'desc' }],
              select: {
                productId: true,
                close: true,
              },
            }),
            this.prisma.productLivePriceTick.findMany({
              where: {
                termId: profile.termId,
                productId: {
                  in: productIds,
                },
              },
              orderBy: [{ tickedAt: 'desc' }],
              select: {
                productId: true,
                price: true,
              },
            }),
          ])
        : [[], []];

    const latestPriceByProduct = new Map<string, number>();
    for (const row of latestPrices) {
      if (!latestPriceByProduct.has(row.productId)) {
        latestPriceByProduct.set(row.productId, this.toNumber(row.close));
      }
    }

    const latestLivePriceByProduct = new Map<string, number>();
    for (const row of latestLiveTicks) {
      if (!latestLivePriceByProduct.has(row.productId)) {
        latestLivePriceByProduct.set(row.productId, this.toNumber(row.price));
      }
    }

    const investmentMarketValue = holdings.reduce((sum, holding) => {
      const units = this.toNumber(holding.units);
      const price =
        latestLivePriceByProduct.get(holding.productId) ??
        latestPriceByProduct.get(holding.productId) ??
        this.toNumber(holding.avgCost);

      return sum + units * price;
    }, 0);

    return (
      walletBalance +
      investmentBalance +
      savingsBalance +
      fdBalance +
      investmentMarketValue
    );
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
      this.logger.error('Failed to create retirement goal', (e as Error).stack);
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

      // Recalculate currentAmount from latest assets
      const currentAmount = await this.calculateCurrentAmountFromAssets(
        profile.id,
      );

      const updatedItems = items.map((item) => ({
        ...item,
        currentAmount: new Prisma.Decimal(currentAmount),
      }));

      return { success: true, data: updatedItems };
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
