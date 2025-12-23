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
import { TermService } from '../services/term.service';
import { CreateTermDto } from '../dto/term/create-term.dto';

@Controller('academic/terms')
export class TermController {
  constructor(private readonly termService: TermService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_CREATE])
  create(@Body() createTermDto: CreateTermDto) {
    return this.termService.create(createTermDto);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_VIEW])
  findAll() {
    return this.termService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.termService.findOne(+id);
  }

  @Patch(':id')
  @NeededPermissions([PERMISSIONS.ACADEMIC.SCHOOL_EDIT])
  update(@Param('id') id: string, @Body() updateSchoolDto: UpdateSchoolDto) {
    return this.termService.updateSchool(id, updateSchoolDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.termService.remove(+id);
  }
}
