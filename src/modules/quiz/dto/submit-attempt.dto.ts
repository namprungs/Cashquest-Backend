import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SubmitAttemptAnswerDto {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedChoiceIds?: string[];

  @IsOptional()
  @IsString()
  answerText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  answerNumber?: number;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

export class SubmitAttemptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitAttemptAnswerDto)
  answers: SubmitAttemptAnswerDto[];
}
