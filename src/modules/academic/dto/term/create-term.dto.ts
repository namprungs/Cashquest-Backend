import { IsDate, IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { TermStatus } from '@prisma/client';

export class CreateTermDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsUUID()
  schoolId: string;

  @Type(() => Date)
  @IsNotEmpty()
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsNotEmpty()
  @IsDate()
  endDate: Date;

  totalWeek?: number;

  @IsNotEmpty()
  @IsEnum(TermStatus)
  status: TermStatus;
}
