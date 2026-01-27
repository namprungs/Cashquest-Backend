import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  Body,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { CreateSchoolDto } from '../dto/create-school.dto';
import { UpdateSchoolDto } from '../dto/update-school.dto';
import { SchoolService } from '../services/school.service';

@Controller('academic')
export class AcademicController {
  constructor(private readonly schoolService: SchoolService) {}

  // ---------------------------
  // School
  // ---------------------------

  @Post('schools')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_CREATE])
  create(@Body() createSchoolDto: CreateSchoolDto) {
    return this.schoolService.create(createSchoolDto);
  }

  /**
   * GET /academic/schools?q=chula&page=1&limit=20
   */
  @Get('schools')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_VIEW])
  findAll(
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.schoolService.findAll({ q, page, limit });
  }

  @Get('schools/:id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_VIEW])
  findOne(@Param('id') id: string) {
    return this.schoolService.findOne(id);
  }

  @Patch('schools/:id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_EDIT])
  update(@Param('id') id: string, @Body() updateSchoolDto: UpdateSchoolDto) {
    return this.schoolService.updateSchool(id, updateSchoolDto);
  }

  @Delete('schools/:id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_DELETE])
  remove(@Param('id') id: string) {
    return this.schoolService.remove(id);
  }
}
