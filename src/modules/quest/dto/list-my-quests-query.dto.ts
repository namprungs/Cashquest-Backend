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
  @Transform(({ obj, key, value }) => {
    const raw = obj?.[key] ?? value;
    if (raw === true || raw === false) {
      return raw;
    }
    const normalized = raw?.toString().trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  })
  @IsBoolean()
  notSubmittedOnly?: boolean;

  @IsOptional()
  @Transform(({ obj, key, value }) => {
    const raw = obj?.[key] ?? value;
    if (raw === true || raw === false) {
      return raw;
    }
    const normalized = raw?.toString().trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  })
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Transform(({ obj, key, value }) => {
    const raw = obj?.[key] ?? value;
    if (raw === true || raw === false) {
      return raw;
    }
    const normalized = raw?.toString().trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  })
  @IsBoolean()
  hideExpired?: boolean;

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
