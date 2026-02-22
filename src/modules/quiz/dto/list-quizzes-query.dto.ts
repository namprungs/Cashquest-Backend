import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListQuizzesQueryDto {
  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
