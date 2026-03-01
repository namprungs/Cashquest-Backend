import { EconomicEventType } from '@prisma/client';
import {
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

  @IsEnum(EconomicEventType)
  eventType: EconomicEventType;

  @IsObject()
  defaultImpact: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isRepeatable?: boolean;
}
