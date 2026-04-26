import { QuestStatus, QuestType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  // ── Hierarchical quest filters ──
  /** Filter by parentId. Use "null" (string) to get root/parent quests only. */
  @IsOptional()
  @IsString()
  parentId?: string;

  /** Filter by isSystem flag */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isSystem?: boolean;
}
