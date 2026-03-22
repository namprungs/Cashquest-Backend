import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { WalletService } from '../services/wallet.service';
import { WalletTransactionHistoryDto } from '../dto/wallet-transaction-history.dto';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Get wallet transaction history with filtering, pagination, and sorting
   * GET /wallets/:walletId/transactions?type=TRANSFER_IN&page=1&limit=20
   */
  @Get(':walletId/transactions')
  async getTransactionHistory(
    @Param('walletId', new ParseUUIDPipe()) walletId: string,
    @Query() query: WalletTransactionHistoryDto,
  ) {
    return this.walletService.getTransactionHistory(
      walletId,
      query.type,
      query.page,
      query.limit,
    );
  }
}
