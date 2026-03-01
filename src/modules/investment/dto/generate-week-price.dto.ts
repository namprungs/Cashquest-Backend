import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class GenerateWeekPriceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsBoolean()
  moveCurrentWeekToNext?: boolean;
}
