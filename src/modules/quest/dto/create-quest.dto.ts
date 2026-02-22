import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { QuestStatus, QuestType } from '@prisma/client';

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

  @IsArray()
  @IsUUID('4', { each: true })
  classroomIds: string[];
}
