import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { GetBadgesQueryDto } from '../dto/get-badges-query.dto';
import { BadgeService } from '../services/badge.service';

@Controller('player/terms/:termId/badges')
export class BadgeController {
  constructor(private readonly badgeService: BadgeService) {}

  @Get()
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  findAllForStudent(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @CurrentUser() user: User,
    @Query() query: GetBadgesQueryDto,
  ) {
    return this.badgeService.getBadgesForStudent(termId, user.id, query.limit);
  }

  @Get(':badgeId')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  findOneForStudent(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('badgeId', new ParseUUIDPipe()) badgeId: string,
    @CurrentUser() user: User,
  ) {
    return this.badgeService.getBadgeById(termId, badgeId, user.id);
  }
}
