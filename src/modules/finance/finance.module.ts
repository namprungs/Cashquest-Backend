// finance/tasks/finance.module.ts (or wherever your main FinanceModule sits)
import { Module } from '@nestjs/common';
import { WalletService } from './services/wallet.service'; // Adjust path if needed
import { BankService } from './services/bank.service';
import { BankController } from './controllers/bank.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { SavingsInterestService } from './services/savings-interest.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BankController], // Register the controller here
  providers: [WalletService, BankService, SavingsInterestService], // Add BankService to providers
  exports: [WalletService, BankService], // Export BankService if other modules need it
})
export class FinanceModule {}
