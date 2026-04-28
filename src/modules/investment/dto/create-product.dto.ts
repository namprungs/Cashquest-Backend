import { Type } from 'class-transformer';
import { ProductType, RiskLevel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';

class ProductSimulationConfigDto {
  @IsOptional()
  @IsString()
  model?: string;

  @Type(() => Number)
  @IsNumber()
  initialPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mu?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sigma?: number;

  @Type(() => Number)
  @IsNumber()
  dt!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  faceValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  couponRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialYield?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  modifiedDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  kappa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  theta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sigmaYield?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yieldFloor?: number;
}

export class CreateProductDto {
  @IsEnum(ProductType)
  type!: ProductType;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_.-]+$/)
  symbol!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(RiskLevel)
  riskLevel!: RiskLevel;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsObject()
  metaJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDividendEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dividendYieldAnnual?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  dividendPayoutIntervalWeeks?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedDividendPerUnit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductSimulationConfigDto)
  simulation?: ProductSimulationConfigDto;
}
