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
import { CreateSchoolDto } from '../dto/create-school.dto';
import { UpdateSchoolDto } from '../dto/update-school.dto';
import { SchoolService } from '../services/school.service';

@Controller('academic')
export class AcademicController {
  constructor(private readonly schoolService: SchoolService) {}

  @Post('schools')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_CREATE])
  create(@Body() createSchoolDto: CreateSchoolDto) {
    return this.schoolService.create(createSchoolDto);
  }

  @Get('schools')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_VIEW])
  findAll() {
    return this.schoolService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schoolService.findOne(+id);
  }

  @Patch('schools/:id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_EDIT])
  update(@Param('id') id: string, @Body() updateSchoolDto: UpdateSchoolDto) {
    return this.schoolService.updateSchool(id, updateSchoolDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schoolService.remove(+id);
  }
}
