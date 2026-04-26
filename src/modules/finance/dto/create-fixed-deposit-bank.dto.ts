import { IsNumber, IsInt } from 'class-validator';

export class CreateFixedDepositBankDto {
  @IsNumber()
  interestRate!: number; // e.g. 0.025 = 2.5%

  @IsInt()
  fixedDepositWeeks!: number; // Fixed maturity period in weeks (e.g., 3)

  @IsNumber()
  principal!: number; // Minimum principal required for FD
}
