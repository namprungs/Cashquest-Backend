import { IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFixedDepositDto {
  @IsUUID()
  studentProfileId!: string;

  @IsUUID()
  fixedDepositBankId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'Principal must be greater than 0' })
  principal!: number;
}
