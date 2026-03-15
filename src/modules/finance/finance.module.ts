// finance/tasks/finance.module.ts (or wherever your main FinanceModule sits)
import { Module } from '@nestjs/common';
import { WalletService } from './services/wallet.service'; // Adjust path if needed
import { BankService } from './services/bank.service';
import { SavingsAccountService } from './services/savings-account.service';
import { BankController } from './controllers/bank.controller';
import { SavingsAccountController } from './controllers/savings-account.controller';
import { WalletController } from './controllers/wallet.controller';
import { SavingsInterestController } from './controllers/savings-interest.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { SavingsInterestService } from './services/savings-interest.service';
import { MeFinanceController } from './controllers/me-finance.controller';
import { MeFinanceService } from './services/me-finance.service';

@Module({
  imports: [ScheduleModule.forRoot()],
<<<<<<< HEAD
  controllers: [
    BankController,
    SavingsAccountController,
    WalletController,
    MeFinanceController,
  ], // Register the controllers here
||||||| parent of 1badf28 (feat/saving-interest-cron-job)
  controllers: [BankController, SavingsAccountController, WalletController], // Register the controllers here
=======
  controllers: [
    BankController,
    SavingsAccountController,
    WalletController,
    SavingsInterestController,
  ], // Register the controllers here
>>>>>>> 1badf28 (feat/saving-interest-cron-job)
  providers: [
    WalletService,
    BankService,
    SavingsAccountService,
    SavingsInterestService,
    MeFinanceService,
  ], // Add services to providers
  exports: [WalletService, BankService, SavingsAccountService], // Export services if other modules need them
})
export class FinanceModule {}
