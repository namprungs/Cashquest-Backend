import { Module } from '@nestjs/common';
import { AcademicService } from './services/academic.service';
import { SchoolService } from './services/school.service';
import { AcademicController } from './controllers/academic.controller';
import { TermController } from './controllers/term.controller';
import { TermService } from './services/term.service';

@Module({
  controllers: [AcademicController, TermController],
  providers: [AcademicService, SchoolService, TermService],
})
export class AcademicModule {}
