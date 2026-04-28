import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TeacherQuizDraftQuestionDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  choices?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  correctIndex?: number;
}

export class TeacherQuizQuestDraftDto {
  @IsUUID()
  termId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  classroomIds: string[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  iconKey?: string;

  @IsOptional()
  @IsString()
  iconColorHex?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rewardCoins?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadlineAt?: Date;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherQuizDraftQuestionDto)
  questions?: TeacherQuizDraftQuestionDto[];
}
