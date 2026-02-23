import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SubmitQuestDto {
  @IsOptional()
  payloadJson?: unknown;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedLatestVersionNo?: number;
}
