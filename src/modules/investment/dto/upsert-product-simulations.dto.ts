import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class ProductSimulationItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsString()
  model?: string;

  @Type(() => Number)
  @IsNumber()
  initialPrice: number;

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
  dt: number;

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

export class UpsertProductSimulationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductSimulationItemDto)
  items: ProductSimulationItemDto[];
}
