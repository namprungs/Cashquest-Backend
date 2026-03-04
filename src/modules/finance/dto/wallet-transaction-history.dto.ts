import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum TransactionTypeFilter {
  QUEST_REWARD = 'QUEST_REWARD',
  BANK_DEPOSIT = 'BANK_DEPOSIT',
  BANK_WITHDRAW = 'BANK_WITHDRAW',
  FINE_PAYMENT = 'FINE_PAYMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export class WalletTransactionHistoryDto {
  @IsOptional()
  @IsEnum(TransactionTypeFilter)
  type?: TransactionTypeFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
