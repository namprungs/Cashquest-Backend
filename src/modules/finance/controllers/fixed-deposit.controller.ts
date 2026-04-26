import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FixedDepositService } from '../services/fixed-deposit.service';
import { CreateFixedDepositDto } from '../dto/create-fixed-deposit.dto';
import { WithdrawFixedDepositDto } from '../dto/withdraw-fixed-deposit.dto';

@Controller('fixed-deposits')
export class FixedDepositController {
  constructor(private readonly fixedDepositService: FixedDepositService) {}

  @Post('open')
  async openFixedDeposit(@Body() dto: CreateFixedDepositDto) {
    return this.fixedDepositService.openFixedDeposit(dto);
  }

  @Post('withdraw')
  async withdrawFixedDeposit(@Body() dto: WithdrawFixedDepositDto) {
    return this.fixedDepositService.withdrawFixedDeposit(dto);
  }

  @Post('process-matured')
  async processMaturedFixedDeposits() {
    return this.fixedDepositService.processMaturedFixedDepositsNow();
  }

  @Get(':id')
  async getFixedDeposit(@Param('id') id: string) {
    return this.fixedDepositService.getFixedDeposit(id);
  }

  @Get('student/:studentProfileId')
  async listByStudent(@Param('studentProfileId') studentProfileId: string) {
    return this.fixedDepositService.listByStudent(studentProfileId);
  }

  @Get('bank/:fixedDepositBankId')
  async listByBank(@Param('fixedDepositBankId') fixedDepositBankId: string) {
    return this.fixedDepositService.listByBank(fixedDepositBankId);
  }
}
