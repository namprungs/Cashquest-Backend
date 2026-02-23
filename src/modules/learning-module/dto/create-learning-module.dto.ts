import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateLearningModuleDto {
  @IsUUID()
  termId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  contentUrl?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderNo: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
