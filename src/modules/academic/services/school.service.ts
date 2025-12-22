import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateSchoolDto } from '../dto/create-school.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { School } from '@prisma/client';
import { UpdateSchoolDto } from '../dto/update-school.dto';

@Injectable()
export class SchoolService {
  constructor(private readonly prisma: PrismaService) {}

  create(createSchoolDto: CreateSchoolDto) {
    const school = this.prisma.school.create({
      data: {
        ...createSchoolDto,
      },
    });
    return {
      success: true,
      data: school,
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
