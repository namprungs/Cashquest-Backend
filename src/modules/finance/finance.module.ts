// finance/tasks/finance.module.ts (or wherever your main FinanceModule sits)
import { Module } from '@nestjs/common';
import { WalletService } from './services/wallet.service'; // Adjust path if needed
import { BankService } from './services/bank.service';
import { SavingsAccountService } from './services/savings-account.service';
import { BankController } from './controllers/bank.controller';
import { SavingsAccountController } from './controllers/savings-account.controller';
import { WalletController } from './controllers/wallet.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { SavingsInterestService } from './services/savings-interest.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BankController, SavingsAccountController, WalletController], // Register the controllers here
  providers: [
    WalletService,
    BankService,
    SavingsAccountService,
    SavingsInterestService,
  ], // Add services to providers
  exports: [WalletService, BankService, SavingsAccountService], // Export services if other modules need them
})
export class FinanceModule {}
