import { IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class WithdrawSavingsDto {
  @IsUUID()
  savingsAccountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'Withdrawal amount must be greater than 0' })
  amount!: number;
}
