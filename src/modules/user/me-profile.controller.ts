import { Controller, Get, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { MeProfileQueryDto } from './dto/me-profile-query.dto';
import { UserService } from './user.service';

@Controller('me')
export class MeProfileController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @NeededPermissions([PERMISSIONS.USER.VIEW_SELF])
  getMyProfile(@CurrentUser() user: User, @Query() query: MeProfileQueryDto) {
    return this.userService.getMeProfile(user.id, query.termId);
  }
}
