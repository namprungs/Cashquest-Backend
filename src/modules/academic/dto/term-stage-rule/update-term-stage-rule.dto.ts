import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTermStageRuleDto {
  @IsOptional()
  @IsString()
  lifeStageId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  startWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  endWeek?: number;
}
