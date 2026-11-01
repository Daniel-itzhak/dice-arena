import { LEADERBOARD_SIZE, LeaderboardSchema, UserSchema, type LeaderboardEntryDto, type UserDto } from '@dice-arena/shared';
import { Controller, Get } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
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

  @Get('ai')
  @ApiOkResponse({
    description: 'The built-in AI opponent. Use its `id` as `player2Id` when creating a vs-AI game.',
    schema: toOpenApiSchema(UserSchema),
  })
  @ApiNotFoundResponse({ description: 'The AI player account does not exist.' })
  getAiPlayer(): Promise<UserDto> {
    return this.users.getAiPlayer();
  }
}
