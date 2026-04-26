import { IsOptional, IsNumber, IsInt } from 'class-validator';

export class UpdateFixedDepositBankDto {
  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @IsOptional()
  @IsInt()
  fixedDepositWeeks?: number;

  @IsOptional()
  @IsNumber()
  principal?: number;
}
