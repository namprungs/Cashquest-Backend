import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateRetirementGoalDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  retirementAge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyExpense?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lifeExpectancy?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentAmount?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;
}
