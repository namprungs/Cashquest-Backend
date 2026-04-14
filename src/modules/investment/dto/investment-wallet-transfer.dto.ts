import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class InvestmentWalletTransferDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  amount: number;
}
