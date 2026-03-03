// finance/tasks/finance.module.ts (or wherever your main FinanceModule sits)
import { Module } from '@nestjs/common';
import { WalletService } from './services/wallet.service'; // Adjust path if needed
import { BankService } from './services/bank.service';
import { BankController } from './controllers/bank.controller';

@Module({
  imports: [], 
  controllers: [BankController], // Register the controller here
  providers: [WalletService, BankService], // Add BankService to providers
  exports: [WalletService, BankService], // Export BankService if other modules need it
})
export class FinanceModule {}