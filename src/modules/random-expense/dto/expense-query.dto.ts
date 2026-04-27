import { IsOptional, IsInt, Min, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class GetPendingExpensesDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class GetExpenseHistoryDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class PayExpenseDto {
  @IsUUID()
  studentExpenseId!: string;

  @IsOptional()
  @IsIn(['WALLET', 'SAVINGS'])
  sourceType?: string = 'WALLET';

  @IsOptional()
  @IsUUID()
  sourceRef?: string; // savingsAccountId if paying from savings
}

export class TriggerWeeklyExpenseDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayOfWeek?: number; // 1=Mon .. 5=Fri (auto-detected if omitted)
}

export class CreateExpenseEventDto {
  @IsUUID()
  termId!: string;

  @IsUUID()
  lifeStageId!: string;

  title!: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  baseAmount?: number;

  @IsOptional()
  iconUrl?: string;
}
