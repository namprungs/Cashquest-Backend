import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class ManualProductPriceItemDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  weekNo: number;

  @Type(() => Number)
  @IsNumber()
  open: number;

  @Type(() => Number)
  @IsNumber()
  high: number;

  @Type(() => Number)
  @IsNumber()
  low: number;

  @Type(() => Number)
  @IsNumber()
  close: number;

  @Type(() => Number)
  @IsNumber()
  returnPct: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  muUsed?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sigmaUsed?: number;

  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class ManualProductPricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualProductPriceItemDto)
  items: ManualProductPriceItemDto[];
}
