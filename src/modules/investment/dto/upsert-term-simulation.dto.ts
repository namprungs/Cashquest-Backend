import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class UpsertTermSimulationDto {
  @Type(() => Number)
  @IsInt()
  randomSeed: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  currentWeek: number;

  @IsString()
  @IsNotEmpty()
  engineVersion: string;
}
