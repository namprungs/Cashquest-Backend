import { IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFixedDepositDto {
  @IsUUID()
  studentProfileId!: string;

  @IsUUID()
  bankId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'Principal must be greater than 0' })
  principal!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'startWeekNo must be at least 1' })
  startWeekNo!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'maturityWeekNo must be at least 1' })
  maturityWeekNo!: number;
}
