import { Module } from '@nestjs/common';
import { WalletService } from './services/wallet.service';

@Module({
  providers: [WalletService],
  exports: [WalletService],
})
export class FinanceModule {}
