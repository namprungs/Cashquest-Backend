import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateSchoolDto } from '../dto/update-school.dto';
import { CreateTermDto } from '../dto/term/create-term.dto';
import { differenceInWeeks } from 'date-fns';

@Injectable()
export class TermService {
  constructor(private readonly prisma: PrismaService) {}

  private calculateTotalWeek(startTime: Date, endTime: Date) {
    return differenceInWeeks(endTime, startTime);
  }

  async create(createTermDto: CreateTermDto) {
    const totalWeeks = this.calculateTotalWeek(
      createTermDto.startDate,
      createTermDto.endDate,
    );
    const term = await this.prisma.term.create({
      data: {
        ...createTermDto,
        totalWeeks,
      },
    });
    return {
      success: true,
      data: term,
    };
  }

  async findAll() {
    try {
      const schools = await this.prisma.school.findMany();
      return {
        success: true,
        data: schools,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        success: false,
        message: 'Database connection failed or Internal Server Error',
        originalError: error.message, // (Optional) ใส่เพื่อ Debug
      });
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} academic`;
  }

  async updateSchool(id: string, data: UpdateSchoolDto) {
    try {
      const school = await this.prisma.school.update({
        where: { id },
        data,
      });
      return {
        success: true,
        data: school,
      };
    } catch (error) {
      // (Optional) จัดการกรณีหา ID ไม่เจอ
      if (error.code === 'P2025') {
        throw new NotFoundException(`School with ID ${id} not found`);
      }
      throw error;
    }
  }

  remove(id: number) {
    return `This action removes a #${id} academic`;
  }
}
