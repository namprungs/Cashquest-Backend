import { Type } from 'class-transformer';
import { MarketRegimeName } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateMarketRegimeDto {
  @IsOptional()
  @IsEnum(MarketRegimeName)
  name?: MarketRegimeName;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  muAdjustment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sigmaAdjustment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  endWeek?: number;
}
