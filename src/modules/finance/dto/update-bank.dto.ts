import { IsOptional, IsString } from 'class-validator';

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  name?: string;
}
