import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { QuestDifficulty, QuestStatus, QuestType } from '@prisma/client';

export class CreateQuestDto {
  @IsUUID()
  termId: string;

  @IsEnum(QuestType)
  type: QuestType;

  @IsOptional()
  @IsUUID()
  quizId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(QuestDifficulty)
  difficulty?: QuestDifficulty;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  rewardCoins: number;

  @IsEnum(QuestStatus)
  status: QuestStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadlineAt?: Date;

  // ── Hierarchical quest fields ──
  /** Set to a parent quest ID to make this a sub-quest (e.g. 1.1, 1.2) */
  @IsOptional()
  @IsUUID()
  parentId?: string;

  /** Display order among siblings (1 = first sub-quest under parent) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderNo?: number;

  @IsArray()
  @IsUUID('4', { each: true })
  classroomIds: string[];
}
