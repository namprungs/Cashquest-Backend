import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;
}
