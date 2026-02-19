import {
  IsEmail,
  IsOptional,
  IsString,
  IsStrongPassword,
  IsUUID,
} from 'class-validator';

export class RegisterUserDto {
  @IsString()
  username: string;

  @IsStrongPassword()
  password: string;

  @IsEmail()
  email: string;

  @IsUUID()
  roleId: string;

  @IsUUID()
  @IsOptional()
  schoolId?: string;
}
