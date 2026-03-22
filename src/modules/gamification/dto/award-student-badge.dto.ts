import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AwardStudentBadgeDto {
  @IsUUID()
  studentProfileId!: string;

  @IsOptional()
  @IsDateString()
  earnedAt?: string;
}
