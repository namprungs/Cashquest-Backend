import { EconomicEventType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEconomicEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

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

  @IsEnum(EconomicEventType)
  eventType: EconomicEventType;

  @IsObject()
  defaultImpact: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isRepeatable?: boolean;
}
