import { IsUUID } from 'class-validator';

export class AddStudentDto {
  @IsUUID()
  studentId: string;
}
