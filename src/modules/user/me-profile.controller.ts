import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { MeProfileQueryDto } from './dto/me-profile-query.dto';
import { UserService } from './user.service';

@Controller('me')
export class MeProfileController {
  constructor(private readonly userService: UserService) {}

  @Get('term-id')
  @NeededPermissions([PERMISSIONS.USER.VIEW_SELF])
  getMyTermId(@CurrentUser() user: User) {
    return this.userService.getMyCurrentTermId(user.id);
  }

  @Get('profile')
  @NeededPermissions([PERMISSIONS.USER.VIEW_SELF])
  getMyProfile(@CurrentUser() user: User, @Query() query: MeProfileQueryDto) {
    return this.userService.getMeProfile(user.id, query.termId);
  }

  @Patch('profile-image')
  @NeededPermissions([PERMISSIONS.USER.VIEW_SELF])
  updateMyProfileImage(
    @CurrentUser() user: User,
    @Body('profileImageUrl') profileImageUrl?: string | null,
  ) {
    return this.userService.updateMyProfileImage(
      user.id,
      profileImageUrl?.trim() || null,
    );
  }

  @Get('leaderboard')
  @NeededPermissions([PERMISSIONS.USER.VIEW_SELF])
  getLeaderboard(
    @CurrentUser() user: User,
    @Query('termId') termId: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? parseInt(limit, 10) : 10;
    return this.userService.getClassroomLeaderboard(user.id, termId, take);
  }
}
