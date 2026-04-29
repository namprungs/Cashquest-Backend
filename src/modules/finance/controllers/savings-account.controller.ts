import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
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
  @NeededPermissions([PERMISSIONS.FINANCE.SAVINGS_ACCOUNT_MANAGE_OWN])
  async openAccount(@Body() dto: CreateSavingsAccountDto) {
    return this.savingsAccountService.openAccount(dto);
  }

  /**
   * Deposit from wallet into savings account
   * POST /savings-accounts/deposit
   */
  @Post('deposit')
  @NeededPermissions([PERMISSIONS.FINANCE.SAVINGS_ACCOUNT_MANAGE_OWN])
  async depositFromWallet(@Body() dto: DepositSavingsDto) {
    return this.savingsAccountService.depositFromWallet(dto);
  }

  /**
   * Withdraw from savings account to wallet
   * POST /savings-accounts/withdraw
   */
  @Post('withdraw')
  @NeededPermissions([PERMISSIONS.FINANCE.SAVINGS_ACCOUNT_MANAGE_OWN])
  async withdrawToWallet(@Body() dto: WithdrawSavingsDto) {
    return this.savingsAccountService.withdrawToWallet(dto);
  }

  /**
   * Get savings account details
   * GET /savings-accounts/:accountId
   */
  @Get(':accountId')
  @NeededPermissions([PERMISSIONS.FINANCE.SAVINGS_ACCOUNT_MANAGE_OWN])
  async getAccount(@Param('accountId') accountId: string) {
    return this.savingsAccountService.getAccount(accountId);
  }

  /**
   * List savings accounts for a student
   * GET /savings-accounts/student/:studentProfileId
   */
  @Get('student/:studentProfileId')
  @NeededPermissions([PERMISSIONS.FINANCE.SAVINGS_ACCOUNT_MANAGE_OWN])
  async listByStudent(@Param('studentProfileId') studentProfileId: string) {
    return this.savingsAccountService.listAccountsByStudent(studentProfileId);
  }

  /**
   * List savings accounts for a savings account bank config (admin only)
   * GET /savings-accounts/bank/:savingsAccountBankId
   */
  @Get('bank/:savingsAccountBankId')
  @NeededPermissions([PERMISSIONS.FINANCE.SAVINGS_ACCOUNT_VIEW_REPORT])
  async listByBank(
    @Param('savingsAccountBankId') savingsAccountBankId: string,
  ) {
    return this.savingsAccountService.listAccountsByBank(savingsAccountBankId);
  }

  /**
   * Close a savings account
   * DELETE /savings-accounts/:accountId
   */
  @Delete(':accountId')
  @NeededPermissions([PERMISSIONS.FINANCE.SAVINGS_ACCOUNT_MANAGE_OWN])
  async closeAccount(@Param('accountId') accountId: string) {
    return this.savingsAccountService.closeAccount(accountId);
  }
}
