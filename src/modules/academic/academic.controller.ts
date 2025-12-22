import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  Req,
  Body,
} from '@nestjs/common';
import { NeededPermissions } from '../auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CreateSchoolDto } from './dto/create-school.dto';
import { SchoolService } from './services/school.service';
import { UpdateSchoolDto } from './dto/update-school.dto';

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
