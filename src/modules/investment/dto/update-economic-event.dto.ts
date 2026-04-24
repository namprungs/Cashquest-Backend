import { EconomicEventType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateEconomicEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(EconomicEventType)
  eventType?: EconomicEventType;

  @IsOptional()
  @IsObject()
  defaultImpact?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isRepeatable?: boolean;
}
