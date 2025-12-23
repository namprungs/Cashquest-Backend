import { Controller, Get, Post, Patch, Param, Delete } from '@nestjs/common';

@Controller('retirement-goals')
export class PlayerController {
  constructor(private readonly playerController: PlayerController) {}

  @Post()
  create() {
    return this.playerController.create();
  }

  @Get()
  findAll() {
    return this.playerController.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.playerController.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string) {
    return this.playerController.update(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.playerController.remove(id);
  }
}
