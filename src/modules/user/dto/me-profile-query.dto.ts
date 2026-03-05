import { IsUUID } from 'class-validator';

export class MeProfileQueryDto {
  @IsUUID()
  termId!: string;
}
