import {
  CreateGameSchema,
  EntityIdSchema,
  GameStateSchema,
  ResetGameSchema,
  type CreateGameDto,
  type GameStateDto,
  type ResetGameDto,
} from '@dice-arena/shared';
import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { toOpenApiSchema, ZodBody } from '../common/zod/zod-body.decorator.js';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe.js';
import { GameService } from './game.service.js';

const gameStateSchema = toOpenApiSchema(GameStateSchema);

@ApiTags('games')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, expired, or invalid bearer token.' })
@UseGuards(JwtAuthGuard)
@Controller('games')
export class GameController {
  constructor(private readonly games: GameService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: 'The new game. Player 1 moves first and every score starts at 0.',
    schema: gameStateSchema,
  })
  @ApiBadRequestResponse({ description: 'The body failed validation, or both player ids are the same user.' })
  @ApiForbiddenResponse({ description: 'The caller is neither of the two players.' })
  @ApiNotFoundResponse({ description: 'One or both players do not exist.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(CreateGameSchema) body: CreateGameDto,
  ): Promise<GameStateDto> {
    return this.games.create(user.id, body);
  }

  @Post(':id/roll')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'The game after the roll. Two sixes clear the round and pass the turn; any other roll adds the sum to the round.',
    schema: gameStateSchema,
  })
  @ApiForbiddenResponse({ description: "It is not the caller's turn." })
  @ApiNotFoundResponse({ description: 'No game has this id.' })
  @ApiConflictResponse({ description: 'The game is already finished, or another action updated it first.' })
  roll(
    @Param('id', new ZodValidationPipe(EntityIdSchema)) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GameStateDto> {
    return this.games.roll(id, user.id);
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'The game after banking the round. Reaching the target wins; otherwise the turn passes.',
    schema: gameStateSchema,
  })
  @ApiBadRequestResponse({ description: 'The current round has no points to bank.' })
  @ApiForbiddenResponse({ description: "It is not the caller's turn." })
  @ApiNotFoundResponse({ description: 'No game has this id.' })
  @ApiConflictResponse({ description: 'The game is already finished, or another action updated it first.' })
  hold(
    @Param('id', new ZodValidationPipe(EntityIdSchema)) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GameStateDto> {
    return this.games.hold(id, user.id);
  }

  @Post(':id/reset')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: 'A new game with the same players. Send an empty object to keep the previous target score.',
    schema: gameStateSchema,
  })
  @ApiBadRequestResponse({ description: 'The replacement target score is outside the allowed range.' })
  @ApiForbiddenResponse({ description: 'The caller is not one of the two players.' })
  @ApiNotFoundResponse({ description: 'No game has this id.' })
  reset(
    @Param('id', new ZodValidationPipe(EntityIdSchema)) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(ResetGameSchema) body: ResetGameDto,
  ): Promise<GameStateDto> {
    return this.games.reset(id, user.id, body.targetScore);
  }
}
