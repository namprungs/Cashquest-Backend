import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { WalletService } from '../services/wallet.service';
import { WalletTransactionHistoryDto } from '../dto/wallet-transaction-history.dto';
import { NeededPermissions } from 'src/modules/auth/decorators/needed-permissions.decorator';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Get wallet transaction history with filtering, pagination, and sorting
   * GET /wallets/:walletId/transactions?type=TRANSFER_IN&account=savings&month=8&year=2025&page=1&limit=20
   */
  @Get(':walletId/transactions')
  @NeededPermissions([PERMISSIONS.FINANCE.WALLET_VIEW_OWN])
  async getTransactionHistory(
    @Param('walletId', new ParseUUIDPipe()) walletId: string,
    @Query() query: WalletTransactionHistoryDto,
  ) {
    return this.walletService.getTransactionHistory(
      walletId,
      query.type,
      query.account,
      query.month,
      query.year,
      query.page,
      query.limit,
    );
  }
}
