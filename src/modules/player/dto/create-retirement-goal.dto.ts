import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateRetirementGoalDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  retirementAge?: number;

  @IsNumber()
  @Min(0)
  monthlyExpense!: number;

  @IsInt()
  @Min(1)
  lifeExpectancy!: number;

  @IsNumber()
  @Min(0)
  targetAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentAmount?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string;
}
