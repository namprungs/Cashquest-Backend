import { IsOptional, IsNumber, IsInt } from 'class-validator';

export class UpdateSavingsAccountBankDto {
  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @IsOptional()
  @IsInt()
  withdrawLimitPerTerm?: number;

  @IsOptional()
  @IsNumber()
  feePerTransaction?: number;
}
