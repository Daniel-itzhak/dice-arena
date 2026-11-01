import { Module } from '@nestjs/common';
import { AiPlayerInitializer } from './ai-player.initializer.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AiPlayerInitializer],
  exports: [UsersService],
})
export class UsersModule {}
