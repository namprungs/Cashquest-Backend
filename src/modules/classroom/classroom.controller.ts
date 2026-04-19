import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { ClassroomService } from './classroom.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { AddStudentDto } from './dto/add-student.dto';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('academic')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  // -----------------------------
  // Create classroom
  // -----------------------------
  @Post('terms/:termId/classrooms')
  @NeededPermissions([PERMISSIONS.ACADEMIC.CLASSROOM_CREATE])
  create(
    @Param('termId') termId: string,
    @CurrentUser() teacher: User,
    @Body() dto: CreateClassroomDto,
  ) {
    return this.classroomService.createClassroom(termId, teacher.id, dto.name);
  }

  // -----------------------------
  // List classrooms in term
  // -----------------------------
  @Get('terms/:termId/classrooms')
  @NeededPermissions([PERMISSIONS.ACADEMIC.CLASSROOM_VIEW])
  findByTerm(@Param('termId') termId: string) {
    return this.classroomService.findByTerm(termId);
  }

  // -----------------------------
  // Teacher home dashboard (summary + classroom cards)
  // -----------------------------
  @Get('terms/:termId/classrooms/me/dashboard')
  @NeededPermissions([PERMISSIONS.ACADEMIC.CLASSROOM_VIEW])
  teacherDashboard(
    @Param('termId') termId: string,
    @CurrentUser() teacher: User,
  ) {
    return this.classroomService.getTeacherDashboard(termId, teacher.id);
  }

  // -----------------------------
  // Add student
  // -----------------------------
  @Post('classrooms/:classroomId/students')
  @NeededPermissions([PERMISSIONS.ACADEMIC.CLASSROOM_EDIT])
  addStudent(
    @Param('classroomId') classroomId: string,
    @Body() dto: AddStudentDto,
  ) {
    return this.classroomService.addStudent(classroomId, dto.studentId);
  }

  // -----------------------------
  // Remove student
  // -----------------------------
  @Delete('classrooms/:classroomId/students/:studentId')
  @NeededPermissions([PERMISSIONS.ACADEMIC.CLASSROOM_EDIT])
  removeStudent(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.classroomService.removeStudent(classroomId, studentId);
  }

  // -----------------------------
  // List students
  // -----------------------------
  @Get('classrooms/:classroomId/students')
  @NeededPermissions([PERMISSIONS.ACADEMIC.CLASSROOM_VIEW])
  listStudents(@Param('classroomId') classroomId: string) {
    return this.classroomService.listStudents(classroomId);
  }

  // -----------------------------
  // Home overview
  // -----------------------------
  @Get('classrooms/:id/home-overview')
  @NeededPermissions([PERMISSIONS.ACADEMIC.CLASSROOM_VIEW])
  homeOverview(@Param('id') classroomId: string) {
    return this.classroomService.getHomeOverview(classroomId);
  }
}
