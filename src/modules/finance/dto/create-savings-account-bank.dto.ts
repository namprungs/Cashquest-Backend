import { IsNumber, IsOptional, IsInt } from 'class-validator';

export class CreateSavingsAccountBankDto {
  @IsOptional()
  @IsNumber()
  interestRate!: number; // e.g. 0.015 = 1.5%

  @IsOptional()
  @IsInt()
  withdrawLimitPerTerm?: number; // defaults to 2000

  @IsOptional()
  @IsNumber()
  feePerTransaction?: number; // defaults to 0
}
