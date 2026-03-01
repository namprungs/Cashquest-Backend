import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class GenerateLiveTicksDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  ticksPerWeek?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @IsString({ each: true })
  productIds?: string[];
}
