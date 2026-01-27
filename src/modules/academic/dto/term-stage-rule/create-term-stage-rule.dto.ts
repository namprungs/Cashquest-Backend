import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateTermStageRuleDto {
  @IsString()
  @IsNotEmpty()
  lifeStageId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  startWeek?: number = 1;

  @IsInt()
  @Min(1)
  endWeek: number;
}
