import { Injectable } from '@nestjs/common';

@Injectable()
export class SchoolService {
  create() {
    return 'This action adds a new academic';
  }

  findAll() {
    return `This action returns all academic`;
  }

  findOne(id: number) {
    return `This action returns a #${id} academic`;
  }

  update(id: number) {
    return `This action updates a #${id} academic`;
  }

  remove(id: number) {
    return `This action removes a #${id} academic`;
  }
}
