import { AI_PLAYER_USERNAME } from '@dice-arena/shared';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Not a valid argon2/bcrypt encoding, so no password can ever verify against the AI account. */
const AI_PLAYER_PASSWORD_HASH = '!';

/** Guarantees the built-in AI opponent exists before the API starts accepting requests. */
@Injectable()
export class AiPlayerInitializer implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiPlayerInitializer.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    const aiPlayer = await this.prisma.user.upsert({
      where: { username: AI_PLAYER_USERNAME },
      update: {},
      create: {
        username: AI_PLAYER_USERNAME,
        passwordHash: AI_PLAYER_PASSWORD_HASH,
        isAi: true,
      },
    });

    if (!aiPlayer.isAi) {
      throw new Error(
        `Username "${AI_PLAYER_USERNAME}" is reserved for the AI player but belongs to a human account (${aiPlayer.id}).`,
      );
    }

    this.logger.log(`AI player "${aiPlayer.username}" ready (${aiPlayer.id})`);
  }
}
