import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class RegenerateWeeksDto {
  // default ความยาวสัปดาห์ ถ้าไม่ระบุจะเป็น 7
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultWeekLengthDays?: number = 7;

  /**
   * overrides: key = weekNo, value = lengthDays
   * example: { "2": 10, "5": 14 }
   */
  @IsOptional()
  @IsObject()
  overrides?: Record<string, number>;
}
