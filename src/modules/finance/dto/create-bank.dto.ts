import { IsUUID, IsString, IsOptional, IsInt, IsNumber } from 'class-validator';

export class CreateBankDto {
  @IsUUID()
  termId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  interestRate!: number; // e.g. 0.015 = 1.5%

  @IsOptional()
  @IsInt()
  withdrawLimitPerTerm?: number;

  @IsOptional()
  @IsNumber()
  feePerTransaction?: number;
}