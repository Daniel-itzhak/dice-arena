import { LEADERBOARD_SIZE, LeaderboardSchema, type LeaderboardEntryDto } from '@dice-arena/shared';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { toOpenApiSchema } from '../common/zod/zod-body.decorator.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('leaderboard')
  @ApiOkResponse({
    description: `The top ${LEADERBOARD_SIZE} human players, ordered by wins (most first). Ties go to the player with fewer games played.`,
    schema: toOpenApiSchema(LeaderboardSchema),
  })
  getLeaderboard(): Promise<LeaderboardEntryDto[]> {
    return this.users.getLeaderboard();
  }
}
