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
  @Type(() => Number)
  @IsNumber()
  initialPrice!: number;

  @Type(() => Number)
  @IsNumber()
  mu!: number;

  @Type(() => Number)
  @IsNumber()
  sigma!: number;

  @Type(() => Number)
  @IsNumber()
  dt!: number;
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
