import { PartialType } from '@nestjs/mapped-types';
import { CreateClassroomDto } from './create-player.dto';

export class UpdateClassroomDto extends PartialType(CreateClassroomDto) {}
