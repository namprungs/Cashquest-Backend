import { IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

export class CreateBankDto {
  @IsUUID()
  termId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;
}
