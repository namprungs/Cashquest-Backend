import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { QuestStatus, QuestType } from '@prisma/client';

export class ListMyQuestsQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  notSubmittedOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsEnum(QuestType)
  type?: QuestType;

  @IsOptional()
  @IsEnum(QuestStatus)
  status?: QuestStatus;
}
