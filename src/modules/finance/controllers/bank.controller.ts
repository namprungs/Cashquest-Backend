import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { BankService } from '../services/bank.service';
import { SavingsAccountBankService } from '../services/savings-account-bank.service';
import { FixedDepositBankService } from '../services/fixed-deposit-bank.service';
import { CreateBankDto } from '../dto/create-bank.dto';
import { UpdateBankDto } from '../dto/update-bank.dto';
import { CreateSavingsAccountBankDto } from '../dto/create-savings-account-bank.dto';
import { UpdateSavingsAccountBankDto } from '../dto/update-savings-account-bank.dto';
import { CreateFixedDepositBankDto } from '../dto/create-fixed-deposit-bank.dto';
import { UpdateFixedDepositBankDto } from '../dto/update-fixed-deposit-bank.dto';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('banks')
export class BankController {
  constructor(
    private readonly bankService: BankService,
    private readonly savingsAccountBankService: SavingsAccountBankService,
    private readonly fixedDepositBankService: FixedDepositBankService,
  ) {}

  // ============================================================
  // BANK CORE CRUD
  // ============================================================

  @Post()
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  createBank(@Body() dto: CreateBankDto) {
    return this.bankService.createBank(dto);
  }

  @Put(':bankId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  updateBank(@Param('bankId') bankId: string, @Body() dto: UpdateBankDto) {
    return this.bankService.updateBank(bankId, dto);
  }

  @Get('term/:termId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_VIEW])
  listBanksByTerm(@Param('termId') termId: string) {
    return this.bankService.listBanksByTerm(termId);
  }

  @Get(':bankId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_VIEW])
  getBank(@Param('bankId') bankId: string) {
    return this.bankService.getBank(bankId);
  }

  @Delete(':bankId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  deleteBank(@Param('bankId') bankId: string) {
    return this.bankService.deleteBank(bankId);
  }

  @Get(':bankId/statistics')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_STAT_VIEW])
  getBankStatistics(@Param('bankId') bankId: string) {
    return this.bankService.getBankStatistics(bankId);
  }

  // ============================================================
  // SAVINGS ACCOUNT BANK CONFIG
  // ============================================================

  @Post(':bankId/savings-config')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  createSavingsConfig(
    @Param('bankId') bankId: string,
    @Body() dto: CreateSavingsAccountBankDto,
  ) {
    return this.savingsAccountBankService.create(bankId, dto);
  }

  @Get('term/:termId/savings-configs')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_VIEW])
  listSavingsConfigsByTerm(@Param('termId') termId: string) {
    return this.savingsAccountBankService.listByTerm(termId);
  }

  @Get(':bankId/savings-configs')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_VIEW])
  listSavingsConfigsByBank(@Param('bankId') bankId: string) {
    return this.savingsAccountBankService.listByBank(bankId);
  }

  @Put('savings-config/:configId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  updateSavingsConfig(
    @Param('configId') configId: string,
    @Body() dto: UpdateSavingsAccountBankDto,
  ) {
    return this.savingsAccountBankService.update(configId, dto);
  }

  @Delete('savings-config/:configId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  deleteSavingsConfig(@Param('configId') configId: string) {
    return this.savingsAccountBankService.remove(configId);
  }

  // ============================================================
  // FIXED DEPOSIT BANK CONFIG
  // ============================================================

  @Post(':bankId/fd-config')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  createFdConfig(
    @Param('bankId') bankId: string,
    @Body() dto: CreateFixedDepositBankDto,
  ) {
    return this.fixedDepositBankService.create(bankId, dto);
  }

  @Get('term/:termId/fd-configs')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_VIEW])
  listFdConfigsByTerm(@Param('termId') termId: string) {
    return this.fixedDepositBankService.listByTerm(termId);
  }

  @Get(':bankId/fd-configs')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_VIEW])
  listFdConfigsByBank(@Param('bankId') bankId: string) {
    return this.fixedDepositBankService.listByBank(bankId);
  }

  @Put('fd-config/:configId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  updateFdConfig(
    @Param('configId') configId: string,
    @Body() dto: UpdateFixedDepositBankDto,
  ) {
    return this.fixedDepositBankService.update(configId, dto);
  }

  @Delete('fd-config/:configId')
  @NeededPermissions([PERMISSIONS.FINANCE.BANK_MANAGE])
  deleteFdConfig(@Param('configId') configId: string) {
    return this.fixedDepositBankService.remove(configId);
  }
}
