import { Type } from 'class-transformer';
import { TermEventStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateTermEventDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

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

  @IsOptional()
  @IsObject()
  customImpact?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(TermEventStatus)
  status?: TermEventStatus;
}
