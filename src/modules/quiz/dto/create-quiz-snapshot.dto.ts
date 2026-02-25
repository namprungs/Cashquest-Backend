import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuizGradingType, QuizQuestionType } from '@prisma/client';

export class QuizChoiceSnapshotDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  tempId?: string;

  @IsInt()
  @Min(1)
  orderNo: number;

  @IsString()
  @IsNotEmpty()
  choiceText: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class QuizQuestionSnapshotDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  tempId?: string;

  @IsInt()
  @Min(1)
  orderNo: number;

  @IsString()
  @IsNotEmpty()
  questionText: string;

  @IsEnum(QuizQuestionType)
  questionType: QuizQuestionType;

  @IsInt()
  @Min(0)
  points: number;

  @IsEnum(QuizGradingType)
  gradingType: QuizGradingType;

  @IsOptional()
  answerKey?: unknown;

  @IsOptional()
  config?: unknown;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => QuizChoiceSnapshotDto)
  choices: QuizChoiceSnapshotDto[];
}

export class CreateQuizSnapshotDto {
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimitSec?: number;

  @IsBoolean()
  passAllRequired: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionSnapshotDto)
  questions: QuizQuestionSnapshotDto[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  rewardCoins?: number;
}
