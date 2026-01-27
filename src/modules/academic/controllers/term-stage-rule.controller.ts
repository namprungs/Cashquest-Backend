import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { CreateTermStageRuleDto } from '../dto/term-stage-rule/create-term-stage-rule.dto';
import { UpdateTermStageRuleDto } from '../dto/term-stage-rule/update-term-stage-rule.dto';
import { TermStageRuleService } from '../services/term-stage-rule.service';
import { AcademicRuleResolverService } from '../services/academic-rule-resolver.service';

@Controller('academic')
export class TermStageRuleController {
  constructor(
    private readonly ruleService: TermStageRuleService,
    private readonly resolver: AcademicRuleResolverService,
  ) {}

  // --- rules ---
  @Post('terms/:termId/stage-rules')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_STAGE_RULE_CREATE])
  create(@Param('termId') termId: string, @Body() dto: CreateTermStageRuleDto) {
    return this.ruleService.create(termId, dto);
  }

  @Get('terms/:termId/stage-rules')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_STAGE_RULE_VIEW])
  findByTerm(@Param('termId') termId: string) {
    return this.ruleService.findByTerm(termId);
  }

  @Patch('term-stage-rules/:ruleId')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_STAGE_RULE_EDIT])
  update(@Param('ruleId') ruleId: string, @Body() dto: UpdateTermStageRuleDto) {
    return this.ruleService.update(ruleId, dto);
  }

  @Delete('term-stage-rules/:ruleId')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_STAGE_RULE_DELETE])
  remove(@Param('ruleId') ruleId: string) {
    return this.ruleService.remove(ruleId);
  }

  // --- resolver endpoint (optional but useful) ---
  // GET /academic/terms/:termId/active-stage?weekNo=5
  @Get('terms/:termId/active-stage')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_STAGE_RULE_VIEW])
  getActiveStage(
    @Param('termId') termId: string,
    @Query('weekNo') weekNoStr: string,
  ) {
    const weekNo = Number(weekNoStr);
    return this.resolver.getActiveLifeStage(termId, weekNo);
  }
}
