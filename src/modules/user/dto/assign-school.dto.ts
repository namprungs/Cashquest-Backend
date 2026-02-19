import { IsUUID } from 'class-validator';

export class AssignSchoolDto {
  @IsUUID()
  schoolId: string;
}
