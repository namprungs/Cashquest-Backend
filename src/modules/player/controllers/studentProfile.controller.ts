import { Controller, Get, Param, Post } from '@nestjs/common';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
// ถ้ายังไม่มี GetUserID ให้ใช้ Req ชั่วคราว หรือสร้าง decorator ตามที่คุย
import { PlayerService } from '../services/studentProfile.service';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('player')
export class PlayerController {
  constructor(private readonly bootstrapService: PlayerService) {}

  @Post('terms/:termId/bootstrap')
  @NeededPermissions([PERMISSIONS.PLAYER.BOOTSTRAP])
  bootstrap(@Param('termId') termId: string, @CurrentUser() user: User) {
    return this.bootstrapService.bootstrap(termId, user.id);
  }

  @Get('terms/:termId/students')
  @NeededPermissions([PERMISSIONS.PLAYER.PROFILE_REPORT_VIEW])
  listStudents(@Param('termId') termId: string) {
    return this.bootstrapService.getAllByTerm(termId);
  }

  @Get('students/:id')
  @NeededPermissions([PERMISSIONS.PLAYER.PROFILE_REPORT_VIEW])
  getStudentProfile(@Param('id') id: string) {
    return this.bootstrapService.getById(id);
  }
}
