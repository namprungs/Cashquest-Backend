import { Type } from 'class-transformer';
import { MarketRegimeName } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, Min } from 'class-validator';

export class CreateMarketRegimeDto {
  @IsEnum(MarketRegimeName)
  name: MarketRegimeName;

  @Type(() => Number)
  @IsNumber()
  muAdjustment: number;

  @Type(() => Number)
  @IsNumber()
  sigmaAdjustment: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  startWeek: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  endWeek: number;
}
