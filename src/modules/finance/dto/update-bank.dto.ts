import { IsOptional, IsNumber, IsInt, IsString } from 'class-validator';

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @IsOptional()
  @IsInt()
  withdrawLimitPerTerm?: number | null;

  @IsOptional()
  @IsNumber()
  feePerTransaction?: number;
}
