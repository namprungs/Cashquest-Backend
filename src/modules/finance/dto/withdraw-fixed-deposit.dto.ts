import { IsUUID } from 'class-validator';

export class WithdrawFixedDepositDto {
  @IsUUID()
  fixedDepositId!: string;
}
