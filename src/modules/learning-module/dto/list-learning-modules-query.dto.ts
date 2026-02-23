import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListLearningModulesQueryDto {
  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
