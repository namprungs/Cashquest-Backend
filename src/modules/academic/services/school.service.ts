import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, School } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSchoolDto } from '../dto/create-school.dto';
import { UpdateSchoolDto } from '../dto/update-school.dto';

type Success<T> = { success: true; data: T };

@Injectable()
export class SchoolService {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------
  // Helpers
  // -----------------------------------------
  private handlePrismaError(error: unknown): never {
    // Re-throw HttpException (your custom errors)
    if (error instanceof HttpException) throw error;

    // Prisma known errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint failed
      if (error.code === 'P2002') {
        // error.meta?.target can tell which field(s) duplicated
        throw new BadRequestException({
          success: false,
          message: 'Duplicate value (unique constraint)',
          meta: error.meta,
        });
      }

      // Record not found
      if (error.code === 'P2025') {
        throw new NotFoundException({
          success: false,
          message: 'Record not found',
        });
      }
    }

    // Fallback
    throw new InternalServerErrorException({
      success: false,
      message: 'Database connection failed or Internal Server Error',
      originalError: (error as any)?.message,
    });
  }

  /**
   * Use this when other services just need to ensure school exists.
   */
  async assertExists(id: string): Promise<void> {
    const found = await this.prisma.school.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        success: false,
        message: `School with ID ${id} not found`,
      });
    }
  }

  // -----------------------------------------
  // CRUD
  // -----------------------------------------
  async create(createSchoolDto: CreateSchoolDto): Promise<Success<School>> {
    try {
      const school = await this.prisma.school.create({
        data: {
          name: createSchoolDto.name,
          plan: createSchoolDto.plan ?? 'FREE',
        },
      });

      return { success: true, data: school };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  /**
   * Find all schools with optional search + pagination.
   * Example: findAll({ q: "chula", page: 1, limit: 20 })
   */
  async findAll(params?: {
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<
    Success<{ items: School[]; total: number; page: number; limit: number }>
  > {
    try {
      const page = Math.max(1, params?.page ?? 1);
      const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
      const skip = (page - 1) * limit;

      const where: Prisma.SchoolWhereInput = params?.q
        ? {
            name: { contains: params.q, mode: 'insensitive' },
          }
        : {};

      const [total, items] = await this.prisma.$transaction([
        this.prisma.school.count({ where }),
        this.prisma.school.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      return {
        success: true,
        data: { items, total, page, limit },
      };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findOne(id: string): Promise<Success<School>> {
    try {
      const school = await this.prisma.school.findUnique({
        where: { id },
      });

      if (!school) {
        throw new NotFoundException({
          success: false,
          message: `School with ID ${id} not found`,
        });
      }

      return { success: true, data: school };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updateSchool(
    id: string,
    data: UpdateSchoolDto,
  ): Promise<Success<School>> {
    try {
      const updated = await this.prisma.school.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.plan !== undefined ? { plan: data.plan } : {}),
        },
      });

      return { success: true, data: updated };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  /**
   * Safe delete:
   * - block deletion if school still has terms or users (recommended)
   * Because your schema has relations, deleting school can cascade or break references.
   */
  async remove(id: string): Promise<Success<{ id: string }>> {
    try {
      // Ensure exists
      await this.assertExists(id);

      const [termCount, userCount] = await this.prisma.$transaction([
        this.prisma.term.count({ where: { schoolId: id } }),
        this.prisma.user.count({ where: { schoolId: id } }),
      ]);

      if (termCount > 0) {
        throw new BadRequestException({
          success: false,
          message: `Cannot delete school: it still has ${termCount} term(s).`,
        });
      }

      if (userCount > 0) {
        throw new BadRequestException({
          success: false,
          message: `Cannot delete school: it still has ${userCount} user(s).`,
        });
      }

      await this.prisma.school.delete({ where: { id } });

      return { success: true, data: { id } };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }
}
