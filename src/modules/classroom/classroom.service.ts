import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlayerService } from 'src/modules/player/services/studentProfile.service';

@Injectable()
export class ClassroomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly playerService: PlayerService,
  ) {}

  // -----------------------------
  // Create classroom
  // -----------------------------
  async createClassroom(termId: string, teacherId: string, name: string) {
    // 1. ตรวจว่า term มีจริง
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, schoolId: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    // 2. ตรวจว่า teacher อยู่ school เดียวกับ term
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: { schoolId: true },
    });
    if (!teacher || teacher.schoolId !== term.schoolId) {
      throw new BadRequestException('Teacher does not belong to this school');
    }

    const classroom = await this.prisma.classroom.create({
      data: {
        name,
        termId,
        teacherId,
      },
    });

    return { success: true, data: classroom };
  }

  // -----------------------------
  // List classrooms in term
  // -----------------------------
  async findByTerm(termId: string) {
    const classrooms = await this.prisma.classroom.findMany({
      where: { termId },
      include: {
        teacher: { select: { id: true, username: true } },
        _count: { select: { students: true } },
      },
    });

    return { success: true, data: classrooms };
  }

  // -----------------------------
  // Add student to classroom
  // -----------------------------
  async addStudent(classroomId: string, studentId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, termId: true, term: { select: { schoolId: true } } },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student || student.schoolId !== classroom.term.schoolId) {
      throw new BadRequestException('Student does not belong to this school');
    }

    try {
      // Bootstrap StudentProfile + Wallet (idempotent)
      await this.playerService.bootstrap(classroom.termId, studentId);

      const record = await this.prisma.classroomStudent.create({
        data: {
          classroomId,
          studentId,
        },
      });
      return { success: true, data: record };
    } catch (err) {
      console.log(err);
      throw new BadRequestException('Student already in classroom');
    }
  }

  // -----------------------------
  // Remove student
  // -----------------------------
  async removeStudent(classroomId: string, studentId: string) {
    await this.prisma.classroomStudent.delete({
      where: {
        classroomId_studentId: {
          classroomId,
          studentId,
        },
      },
    });

    return { success: true };
  }

  // -----------------------------
  // List students in classroom
  // -----------------------------
  async listStudents(classroomId: string) {
    const students = await this.prisma.classroomStudent.findMany({
      where: { classroomId },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return { success: true, data: students };
  }
}
