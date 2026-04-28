import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApproveSubmissionQuestionReviewDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  awardedPoints?: number;
}

export class ApproveSubmissionDto {
  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveSubmissionQuestionReviewDto)
  questionReviews?: ApproveSubmissionQuestionReviewDto[];
}

export class RejectSubmissionDto {
  @IsString()
  @IsNotEmpty()
  rejectReason: string;

  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}
