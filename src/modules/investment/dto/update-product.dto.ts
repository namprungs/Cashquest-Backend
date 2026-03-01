import { ProductType, RiskLevel } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_.-]+$/)
  symbol?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsObject()
  metaJson?: Record<string, unknown>;
}
