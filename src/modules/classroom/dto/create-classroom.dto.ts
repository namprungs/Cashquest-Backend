import { IsNotEmpty, IsString } from 'class-validator';

export class CreateClassroomDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
