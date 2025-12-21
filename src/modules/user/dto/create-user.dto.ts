import { IsEmail, IsString, IsStrongPassword } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsStrongPassword()
  password: string;

  @IsEmail()
  email: string;
}
