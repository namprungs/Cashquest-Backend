import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { BankService } from '../services/bank.service';
import { CreateBankDto } from '../dto/create-bank.dto';
import { UpdateBankDto } from '../dto/update-bank.dto';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('banks')
export class BankController {
  constructor(private readonly bankService: BankService) {}

  @Post()
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  createBank(@Body() dto: CreateBankDto) {
    return this.bankService.createBank(dto);
  }

  @Put(':bankId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  updateBank(@Param('bankId') bankId: string, @Body() dto: UpdateBankDto) {
    return this.bankService.updateBank(bankId, dto);
  }

  @Get('term/:termId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  listBanksByTerm(@Param('termId') termId: string) {
    return this.bankService.listBanksByTerm(termId);
  }
}
