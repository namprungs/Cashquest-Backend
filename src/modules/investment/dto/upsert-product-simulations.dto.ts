import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class ProductSimulationItemDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  initialPrice: number;

  @Type(() => Number)
  @IsNumber()
  mu: number;

  @Type(() => Number)
  @IsNumber()
  sigma: number;

  @Type(() => Number)
  @IsNumber()
  dt: number;
}

export class UpsertProductSimulationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductSimulationItemDto)
  items: ProductSimulationItemDto[];
}
