import {
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { SavingsInterestService } from '../services/savings-interest.service';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('admin/savings-interest')
export class SavingsInterestController {
  constructor(private readonly savingsInterestService: SavingsInterestService) {}

  /**
   * Manually trigger interest calculation (for testing/admin purposes)
   * POST /admin/savings-interest/trigger
   */
  @Post('trigger')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  async triggerInterestCalculation() {
    return this.savingsInterestService.triggerInterestCalculation();
  }
}