import { Module } from '@nestjs/common';
import { AcademicService } from './services/academic.service';
import { SchoolService } from './services/school.service';
import { AcademicController } from './controllers/academic.controller';
import { TermController } from './controllers/term.controller';
import { TermService } from './services/term.service';
import { LifeStageController } from './controllers/life-stage.controller';
import { TermStageRuleController } from './controllers/term-stage-rule.controller';
import { AcademicRuleResolverService } from './services/academic-rule-resolver.service';
import { LifeStageService } from './services/life-stage.service';
import { TermStageRuleService } from './services/term-stage-rule.service';

@Module({
  controllers: [
    AcademicController,
    TermController,
    LifeStageController,
    TermStageRuleController,
  ],
  providers: [
    AcademicService,
    SchoolService,
    TermService,
    LifeStageService,
    TermStageRuleService,
    AcademicRuleResolverService,
  ],
  exports: [AcademicRuleResolverService],
})
export class AcademicModule {}
