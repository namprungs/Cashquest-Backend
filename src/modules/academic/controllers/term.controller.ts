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
import { TermStatus } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { TermService } from '../services/term.service';
import { CreateTermDto } from '../dto/term/create-term.dto';
import { UpdateTermDto } from '../dto/term/update-term.dto';
import { RegenerateWeeksDto } from '../dto/term/regenerate-weeks.dto';

@Controller('academic')
export class TermController {
  constructor(private readonly termService: TermService) {}

  // -----------------------------
  // Create & List (scoped by school)
  // -----------------------------
  @Post('schools/:schoolId/terms')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_CREATE])
  create(@Param('schoolId') schoolId: string, @Body() dto: CreateTermDto) {
    // บังคับ schoolId จาก path เพื่อกันคนส่ง schoolId มั่วใน body
    return this.termService.create({ ...dto, schoolId });
  }

  @Get('schools/:schoolId/terms')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_VIEW])
  findBySchool(
    @Param('schoolId') schoolId: string,
    @Query('status') status?: TermStatus,
  ) {
    return this.termService.findAll({ schoolId, status });
  }

  // -----------------------------
  // Term detail
  // -----------------------------
  @Get('terms/:termId')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_VIEW])
  findOne(@Param('termId') termId: string) {
    return this.termService.findOne(termId);
  }

  // -----------------------------
  // Update term (DRAFT only)
  // -----------------------------
  @Patch('terms/:termId')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_EDIT])
  update(@Param('termId') termId: string, @Body() dto: UpdateTermDto) {
    return this.termService.update(termId, dto);
  }

  // -----------------------------
  // Status transitions
  // -----------------------------
  @Post('terms/:termId/publish')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_PUBLISH])
  publish(@Param('termId') termId: string) {
    return this.termService.publish(termId);
  }

  @Post('terms/:termId/complete')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_COMPLETE])
  complete(@Param('termId') termId: string) {
    return this.termService.complete(termId);
  }

  // -----------------------------
  // Delete (DRAFT only)
  // -----------------------------
  @Delete('terms/:termId')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_DELETE])
  remove(@Param('termId') termId: string) {
    return this.termService.remove(termId);
  }

  // POST /academic/terms/:termId/weeks/regenerate
  @Post('terms/:termId/weeks/regenerate')
  @NeededPermissions([PERMISSIONS.ACADEMIC.TERM_EDIT])
  regenerateWeeks(
    @Param('termId') termId: string,
    @Body() dto: RegenerateWeeksDto,
  ) {
    return this.termService.regenerateWeeksWithOverrides(termId, {
      defaultWeekLengthDays: dto.defaultWeekLengthDays,
      overrides: dto.overrides,
    });
  }
}
