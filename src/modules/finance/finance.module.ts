// finance/tasks/finance.module.ts (or wherever your main FinanceModule sits)
import { Module } from '@nestjs/common';
import { WalletService } from './services/wallet.service';
import { BankService } from './services/bank.service';
import { SavingsAccountBankService } from './services/savings-account-bank.service';
import { FixedDepositBankService } from './services/fixed-deposit-bank.service';
import { SavingsAccountService } from './services/savings-account.service';
import { FixedDepositService } from './services/fixed-deposit.service';
import { BankController } from './controllers/bank.controller';
import { SavingsAccountController } from './controllers/savings-account.controller';
import { WalletController } from './controllers/wallet.controller';
import { FixedDepositController } from './controllers/fixed-deposit.controller';
import { SavingsInterestController } from './controllers/savings-interest.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { SavingsInterestService } from './services/savings-interest.service';
import { MeFinanceController } from './controllers/me-finance.controller';
import { MeFinanceService } from './services/me-finance.service';
import { QuestModule } from '../quest/quest.module';

@Module({
  imports: [ScheduleModule.forRoot(), QuestModule],
  controllers: [
    BankController,
    SavingsAccountController,
    WalletController,
    FixedDepositController,
    SavingsInterestController,
    MeFinanceController,
  ], // Register the controllers here
  providers: [
    WalletService,
    BankService,
    SavingsAccountBankService,
    FixedDepositBankService,
    SavingsAccountService,
    FixedDepositService,
    SavingsInterestService,
    MeFinanceService,
  ], // Add services to providers
  exports: [
    WalletService,
    BankService,
    SavingsAccountBankService,
    FixedDepositBankService,
    SavingsAccountService,
    FixedDepositService,
  ], // Export services if other modules need them
})
export class FinanceModule {}
