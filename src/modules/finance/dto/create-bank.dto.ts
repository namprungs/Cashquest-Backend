import { IsUUID, IsString } from 'class-validator';

export class CreateBankDto {
  @IsUUID()
  termId!: string;

  @IsString()
  name!: string;
}
