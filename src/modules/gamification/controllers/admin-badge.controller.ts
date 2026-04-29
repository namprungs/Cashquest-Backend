import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { AwardStudentBadgeDto } from '../dto/award-student-badge.dto';
import { CreateBadgeDto } from '../dto/create-badge.dto';
import { UpdateBadgeDto } from '../dto/update-badge.dto';
import { BadgeService } from '../services/badge.service';

@Controller('badges/terms/:termId')
export class AdminBadgeController {
  constructor(private readonly badgeService: BadgeService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.BADGE.MANAGE])
  create(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Body() dto: CreateBadgeDto,
  ) {
    return this.badgeService.createBadge(termId, dto);
  }

  @Get()
  @NeededPermissions([PERMISSIONS.BADGE.MANAGE])
  findAll(@Param('termId', new ParseUUIDPipe()) termId: string) {
    return this.badgeService.getBadgesForAdmin(termId);
  }

  @Get(':badgeId')
  @NeededPermissions([PERMISSIONS.BADGE.MANAGE])
  findOne(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('badgeId', new ParseUUIDPipe()) badgeId: string,
  ) {
    return this.badgeService.getBadgeByIdForAdmin(termId, badgeId);
  }

  @Patch(':badgeId')
  @NeededPermissions([PERMISSIONS.BADGE.MANAGE])
  update(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('badgeId', new ParseUUIDPipe()) badgeId: string,
    @Body() dto: UpdateBadgeDto,
  ) {
    return this.badgeService.updateBadge(termId, badgeId, dto);
  }

  @Delete(':badgeId')
  @NeededPermissions([PERMISSIONS.BADGE.MANAGE])
  remove(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('badgeId', new ParseUUIDPipe()) badgeId: string,
  ) {
    return this.badgeService.deleteBadge(termId, badgeId);
  }

  @Post(':badgeId/award')
  @NeededPermissions([PERMISSIONS.BADGE.AWARD])
  awardToStudentProfile(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Param('badgeId', new ParseUUIDPipe()) badgeId: string,
    @Body() dto: AwardStudentBadgeDto,
  ) {
    return this.badgeService.awardBadgeToStudentProfile(termId, badgeId, dto);
  }
}
