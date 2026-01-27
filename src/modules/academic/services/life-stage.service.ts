import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLifeStageDto } from '../dto/life-stage/create-life-stage.dto';
import { UpdateLifeStageDto } from '../dto/life-stage/update-life-stage.dto';

@Injectable()
export class LifeStageService {
  constructor(private readonly prisma: PrismaService) {}

  private handleError(error: unknown): never {
    if (error instanceof HttpException) throw error;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new BadRequestException({
          success: false,
          message: 'Duplicate value (unique constraint)',
          meta: error.meta,
        });
      }
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

  async create(dto: CreateLifeStageDto) {
    try {
      const created = await this.prisma.lifeStage.create({
        data: dto,
      });

      return { success: true, data: created };
    } catch (e) {
      this.handleError(e);
    }
  }

  async findAll() {
    try {
      const items = await this.prisma.lifeStage.findMany({
        orderBy: [{ orderNo: 'asc' }, { createdAt: 'asc' }],
      });
      return { success: true, data: items };
    } catch (e) {
      this.handleError(e);
    }
  }

  async findOne(id: string) {
    try {
      const item = await this.prisma.lifeStage.findUnique({ where: { id } });
      if (!item) {
        throw new NotFoundException({
          success: false,
          message: `LifeStage with ID ${id} not found`,
        });
      }
      return { success: true, data: item };
    } catch (e) {
      this.handleError(e);
    }
  }

  async update(id: string, dto: UpdateLifeStageDto) {
    try {
      const updated = await this.prisma.lifeStage.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.orderNo !== undefined ? { orderNo: dto.orderNo } : {}),
          ...(dto.unlockInvestment !== undefined
            ? { unlockInvestment: dto.unlockInvestment }
            : {}),
          ...(dto.enableRandomExpense !== undefined
            ? { enableRandomExpense: dto.enableRandomExpense }
            : {}),
        },
      });
      return { success: true, data: updated };
    } catch (e) {
      this.handleError(e);
    }
  }

  async remove(id: string) {
    try {
      // ถ้ามี TermStageRule ผูกอยู่ จะลบได้เพราะ onDelete: Cascade อยู่ฝั่ง TermStageRule->LifeStage ใน schema ของคุณ
      // แต่ถ้าอยากกันลบ ให้เช็ก count ก่อนแล้วค่อย throw
      await this.prisma.lifeStage.delete({ where: { id } });
      return { success: true, data: { id } };
    } catch (e) {
      this.handleError(e);
    }
  }
}
