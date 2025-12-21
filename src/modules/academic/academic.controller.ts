import { Controller, Get, Post, Patch, Param, Delete } from '@nestjs/common';
import { AcademicService } from './services/academic.service';

@Controller('academic')
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  create() {
    return this.academicService.create();
  }

  @Get()
  findAll() {
    return this.academicService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.academicService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string) {
    return this.academicService.update(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.academicService.remove(+id);
  }
}
