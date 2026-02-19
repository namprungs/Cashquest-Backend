import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  permissions: string[]; // array of permission names e.g. 'USER_CREATE'
}
