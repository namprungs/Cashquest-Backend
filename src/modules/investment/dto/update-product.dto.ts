import { ProductType, RiskLevel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
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

  @IsOptional()
  @IsBoolean()
  isDividendEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dividendYieldAnnual?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dividendPayoutIntervalWeeks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedDividendPerUnit?: number;
}
