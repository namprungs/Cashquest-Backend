import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  Body,
} from '@nestjs/common';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { UpdateSchoolDto } from '../dto/update-school.dto';
import { ClassroomService } from '../services/classroom.service';

@Controller('academic/classrooms')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_VIEW])
  create(@Body() createClassroomDto) {
    return this.classroomService.create(createClassroomDto);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_VIEW])
  findAll() {
    return this.classroomService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.classroomService.findOne(+id);
  }

  @Patch(':id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_EDIT])
  update(@Param('id') id: string, @Body() updateSchoolDto: UpdateSchoolDto) {
    return this.classroomService.updateSchool(id, updateSchoolDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.classroomService.remove(+id);
  }
}
