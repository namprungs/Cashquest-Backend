import { IsUUID } from 'class-validator';

export class MeFinanceQueryDto {
  @IsUUID()
  termId!: string;
}
