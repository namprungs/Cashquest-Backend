import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ProcessOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNo?: number;
}
