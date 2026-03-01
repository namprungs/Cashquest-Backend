import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class ListProductPricesQueryDto {
  @IsOptional()
  @IsIn(['1d', '5d', '1m', '3m', '6m', '12m'])
  range?: '1d' | '5d' | '1m' | '3m' | '6m' | '12m';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toWeek?: number;
}
