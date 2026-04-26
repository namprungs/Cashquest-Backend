import { IsUUID, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateSavingsAccountDto {
  @IsUUID()
  studentProfileId!: string;

  @IsUUID()
  savingsAccountBankId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Initial deposit must be 0 or greater' })
  initialDeposit?: number; // Optional initial deposit when opening account
}
