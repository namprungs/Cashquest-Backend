import { IsDate, IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTermDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @Type(() => Date)
  @IsNotEmpty()
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsNotEmpty()
  @IsDate()
  endDate: Date;

  schoolId: string;

  totalWeek?: number;
}
