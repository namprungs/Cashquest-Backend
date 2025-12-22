import { Module } from '@nestjs/common';
import { AcademicService } from './services/academic.service';
import { AcademicController } from './academic.controller';
import { SchoolService } from './services/school.service';

@Module({
  controllers: [AcademicController],
  providers: [AcademicService, SchoolService],
})
export class AcademicModule {}
