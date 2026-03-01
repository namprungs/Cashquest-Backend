import { Type } from 'class-transformer';
import { OrderSide, OrderType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  productId: string;

  @IsEnum(OrderSide)
  side: OrderSide;

  @IsEnum(OrderType)
  orderType: OrderType;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requestedPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fee?: number;
}
