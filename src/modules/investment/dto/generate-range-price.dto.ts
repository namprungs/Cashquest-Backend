import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class GenerateRangePriceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startWeek: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  endWeek: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsBoolean()
  moveCurrentWeekToNext?: boolean;
}
