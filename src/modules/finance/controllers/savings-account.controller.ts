import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { SavingsAccountService } from '../services/savings-account.service';
import { CreateSavingsAccountDto } from '../dto/create-savings-account.dto';
import { DepositSavingsDto } from '../dto/deposit-savings.dto';
import { WithdrawSavingsDto } from '../dto/withdraw-savings.dto';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('savings-accounts')
export class SavingsAccountController {
  constructor(private readonly savingsAccountService: SavingsAccountService) {}

  /**
   * Open a new savings account
   * POST /savings-accounts/open
   */
  @Post('open')
  async openAccount(@Body() dto: CreateSavingsAccountDto) {
    return this.savingsAccountService.openAccount(dto);
  }

  /**
   * Deposit from wallet into savings account
   * POST /savings-accounts/deposit
   */
  @Post('deposit')
  async depositFromWallet(@Body() dto: DepositSavingsDto) {
    return this.savingsAccountService.depositFromWallet(dto);
  }

  /**
   * Withdraw from savings account to wallet
   * POST /savings-accounts/withdraw
   */
  @Post('withdraw')
  async withdrawToWallet(@Body() dto: WithdrawSavingsDto) {
    return this.savingsAccountService.withdrawToWallet(dto);
  }

  /**
   * Get savings account details
   * GET /savings-accounts/:accountId
   */
  @Get(':accountId')
  async getAccount(@Param('accountId') accountId: string) {
    return this.savingsAccountService.getAccount(accountId);
  }

  /**
   * List savings accounts for a student
   * GET /savings-accounts/student/:studentProfileId
   */
  @Get('student/:studentProfileId')
  async listByStudent(
    @Param('studentProfileId') studentProfileId: string,
  ) {
    return this.savingsAccountService.listAccountsByStudent(studentProfileId);
  }

  /**
   * List savings accounts for a bank (admin only)
   * GET /savings-accounts/bank/:bankId
   */
  @Get('bank/:bankId')
  @NeededPermissions([PERMISSIONS.SIMULATION.CONTENT_MANAGE])
  async listByBank(@Param('bankId') bankId: string) {
    return this.savingsAccountService.listAccountsByBank(bankId);
  }

  /**
   * Close a savings account
   * DELETE /savings-accounts/:accountId
   */
  @Delete(':accountId')
  async closeAccount(@Param('accountId') accountId: string) {
    return this.savingsAccountService.closeAccount(accountId);
  }
}
