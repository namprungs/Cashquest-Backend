import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class ProcessPayoutsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dividendPerUnit?: number;
}
