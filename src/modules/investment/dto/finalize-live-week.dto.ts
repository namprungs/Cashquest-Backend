import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FinalizeLiveWeekDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;

  @IsOptional()
  @IsBoolean()
  moveCurrentWeekToNext?: boolean;

  @IsOptional()
  @IsBoolean()
  clearTicksAfterFinalize?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @IsString({ each: true })
  productIds?: string[];
}
