import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Query,
} from '@nestjs/common';
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
  @NeededPermissions([PERMISSIONS.CLASSROOM.CREATE])
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
  @NeededPermissions([PERMISSIONS.CLASSROOM.VIEW])
  findByTerm(@Param('termId') termId: string) {
    return this.classroomService.findByTerm(termId);
  }

  // -----------------------------
  // Teacher home dashboard (summary + classroom cards)
  // -----------------------------
  @Get('terms/:termId/classrooms/me/dashboard')
  @NeededPermissions([PERMISSIONS.CLASSROOM.DASHBOARD_VIEW])
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
  @NeededPermissions([PERMISSIONS.CLASSROOM.STUDENT_MANAGE])
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
  @NeededPermissions([PERMISSIONS.CLASSROOM.STUDENT_MANAGE])
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
  @NeededPermissions([PERMISSIONS.CLASSROOM.STUDENT_VIEW])
  listStudents(@Param('classroomId') classroomId: string) {
    return this.classroomService.listStudents(classroomId);
  }

  @Get('classrooms/:classroomId/students/overview')
  @NeededPermissions([PERMISSIONS.CLASSROOM.STUDENT_VIEW])
  studentOverview(@Param('classroomId') classroomId: string) {
    return this.classroomService.getStudentOverview(classroomId);
  }

  @Get('classrooms/:classroomId/students/:studentId/detail')
  @NeededPermissions([PERMISSIONS.CLASSROOM.STUDENT_VIEW])
  studentDetail(
    @Param('classroomId') classroomId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.classroomService.getStudentDetail(classroomId, studentId);
  }

  // -----------------------------
  // Home overview
  // -----------------------------
  @Get('classrooms/:id/home-overview')
  @NeededPermissions([PERMISSIONS.CLASSROOM.DASHBOARD_VIEW])
  homeOverview(@Param('id') classroomId: string) {
    return this.classroomService.getHomeOverview(classroomId);
  }

  @Get('classrooms/:classroomId/pending-submissions')
  @NeededPermissions([PERMISSIONS.CLASSROOM.SUBMISSION_VIEW])
  pendingSubmissions(
    @Param('classroomId') classroomId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.classroomService.getPendingSubmissions(classroomId, limitNum);
  }
}
