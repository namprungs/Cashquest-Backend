import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateLifeStageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(0)
  orderNo: number;

  @IsOptional()
  @IsBoolean()
  unlockInvestment?: boolean;

  @IsOptional()
  @IsBoolean()
  enableRandomExpense?: boolean;
}
