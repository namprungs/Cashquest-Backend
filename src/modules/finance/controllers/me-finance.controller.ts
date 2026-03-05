import { Controller, Get, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { MeFinanceQueryDto } from '../dto/me-finance-query.dto';
import { MeFinanceService } from '../services/me-finance.service';

@Controller('me')
export class MeFinanceController {
  constructor(private readonly meFinanceService: MeFinanceService) {}

  @Get('finance')
  @NeededPermissions([PERMISSIONS.SIMULATION.PLAY])
  getMyFinance(@CurrentUser() user: User, @Query() query: MeFinanceQueryDto) {
    return this.meFinanceService.getDashboard(query.termId, user);
  }
}
