import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateSchoolDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEnum(['FREE', 'PREMIUM'])
  plan: string;
}
