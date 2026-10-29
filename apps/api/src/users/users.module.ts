import { Module } from '@nestjs/common';
import { AiPlayerInitializer } from './ai-player.initializer.js';

@Module({
  providers: [AiPlayerInitializer],
})
export class UsersModule {}
