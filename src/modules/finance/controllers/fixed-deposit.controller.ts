import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FixedDepositService } from '../services/fixed-deposit.service';
import { CreateFixedDepositDto } from '../dto/create-fixed-deposit.dto';
import { WithdrawFixedDepositDto } from '../dto/withdraw-fixed-deposit.dto';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('fixed-deposits')
export class FixedDepositController {
  constructor(private readonly fixedDepositService: FixedDepositService) {}

  @Post('open')
  @NeededPermissions([PERMISSIONS.FINANCE.FIXED_DEPOSIT_MANAGE_OWN])
  async openFixedDeposit(@Body() dto: CreateFixedDepositDto) {
    return this.fixedDepositService.openFixedDeposit(dto);
  }

  @Post('withdraw')
  @NeededPermissions([PERMISSIONS.FINANCE.FIXED_DEPOSIT_MANAGE_OWN])
  async withdrawFixedDeposit(@Body() dto: WithdrawFixedDepositDto) {
    return this.fixedDepositService.withdrawFixedDeposit(dto);
  }

  @Post('process-matured')
  @NeededPermissions([PERMISSIONS.FINANCE.INTEREST_RUN])
  async processMaturedFixedDeposits() {
    return this.fixedDepositService.processMaturedFixedDepositsNow();
  }

  @Get(':id')
  @NeededPermissions([PERMISSIONS.FINANCE.FIXED_DEPOSIT_MANAGE_OWN])
  async getFixedDeposit(@Param('id') id: string) {
    return this.fixedDepositService.getFixedDeposit(id);
  }

  @Get('student/:studentProfileId')
  @NeededPermissions([PERMISSIONS.FINANCE.FIXED_DEPOSIT_MANAGE_OWN])
  async listByStudent(@Param('studentProfileId') studentProfileId: string) {
    return this.fixedDepositService.listByStudent(studentProfileId);
  }

  @Get('bank/:fixedDepositBankId')
  @NeededPermissions([PERMISSIONS.FINANCE.FIXED_DEPOSIT_VIEW_REPORT])
  async listByBank(@Param('fixedDepositBankId') fixedDepositBankId: string) {
    return this.fixedDepositService.listByBank(fixedDepositBankId);
  }
}
