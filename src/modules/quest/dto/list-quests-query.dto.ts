import { QuestStatus, QuestType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListQuestsQueryDto {
  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsEnum(QuestStatus)
  status?: QuestStatus;

  @IsOptional()
  @IsEnum(QuestType)
  type?: QuestType;

  @IsOptional()
  @IsString()
  search?: string;
}
