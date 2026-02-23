import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveSubmissionDto {
  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}

export class RejectSubmissionDto {
  @IsString()
  @IsNotEmpty()
  rejectReason: string;

  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}
