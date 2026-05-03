import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBadgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  ruleJson?: Record<string, unknown>;
}
