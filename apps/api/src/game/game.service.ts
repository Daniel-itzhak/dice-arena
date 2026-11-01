import { DIE_MAX_FACE, type AiStepResponseDto, type CreateGameDto, type GameStateDto } from '@dice-arena/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiStrategyService } from './ai-strategy.service.js';
import { DiceService } from './dice.service.js';
import { toGameState, type GamePlayerRecord, type GameRecord } from './game.mappers.js';

/** Prisma error when a transaction loses a write conflict or deadlock. */
const WRITE_CONFLICT = 'P2034';

const STALE_GAME_MESSAGE = 'The game changed before this action could be applied';

const playerSelect = { id: true, username: true, isAi: true, wins: true } satisfies Prisma.UserSelect;

const gameInclude = {
  player1: { select: playerSelect },
  player2: { select: playerSelect },
} satisfies Prisma.GameInclude;

type GameDb = Prisma.TransactionClient | PrismaService;

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dice: DiceService,
    private readonly aiStrategy: AiStrategyService,
  ) {}

  /**
   * @throws BadRequestException when both player ids are the same user.
   * @throws ForbiddenException when the caller is neither player.
   * @throws NotFoundException when either player does not exist.
   */
  async create(userId: string, { player1Id, player2Id, targetScore }: CreateGameDto): Promise<GameStateDto> {
    if (player1Id === player2Id) {
      throw new BadRequestException('player1Id and player2Id must be different users');
    }
    this.assertParticipant(player1Id, player2Id, userId, 'You can only start a game you are playing in');

    const players = await this.prisma.user.findMany({
      where: { id: { in: [player1Id, player2Id] } },
      select: { id: true },
    });
    if (players.length !== 2) {
      throw new NotFoundException('One or both players do not exist');
    }

    return this.insertGame(player1Id, player2Id, targetScore);
  }

  /**
   * @throws NotFoundException when the game does not exist.
   * @throws ForbiddenException when it is not the caller's turn.
   * @throws ConflictException when the game is finished or another action updated it first.
   */
  roll(gameId: string, userId: string): Promise<GameStateDto> {
    return this.transaction(async (tx) => {
      const game = await this.requireGame(tx, gameId);
      this.assertPlayersTurn(game, userId);
      return toGameState(await this.applyRoll(tx, game));
    });
  }

  /**
   * @throws NotFoundException when the game does not exist.
   * @throws ForbiddenException when it is not the caller's turn.
   * @throws BadRequestException when the round has no points to bank.
   * @throws ConflictException when the game is finished or another action updated it first.
   */
  hold(gameId: string, userId: string): Promise<GameStateDto> {
    return this.transaction(async (tx) => {
      const game = await this.requireGame(tx, gameId);
      this.assertPlayersTurn(game, userId);
      return toGameState(await this.applyHold(tx, game));
    });
  }

  /**
   * Plays exactly one AI action (a roll or a hold) so the client can show the AI's turn one step at a time.
   * The caller keeps calling while the AI is still the active player.
   * @throws NotFoundException when the game does not exist.
   * @throws ForbiddenException when the caller is not in the game or the AI is not the active player.
   * @throws ConflictException when the game is finished or another action updated it first.
   */
  aiStep(gameId: string, userId: string): Promise<AiStepResponseDto> {
    return this.transaction(async (tx) => {
      const game = await this.requireGame(tx, gameId);
      this.assertAiTurn(game, userId);

      const aiId = game.activePlayerId;
      const aiDecision = this.aiStrategy.decide({
        targetScore: game.targetScore,
        aiScore: globalScoreOf(game, aiId),
        opponentScore: globalScoreOf(game, otherPlayerId(game, aiId)),
        roundScore: game.currentRoundScore,
      });
      const saved = aiDecision === 'HOLD' ? await this.applyHold(tx, game) : await this.applyRoll(tx, game);
      return { ...toGameState(saved), aiDecision };
    });
  }

  /**
   * @throws NotFoundException when the game does not exist.
   * @throws ForbiddenException when the caller is neither player.
   */
  async reset(gameId: string, userId: string, targetScore?: number): Promise<GameStateDto> {
    const existing = await this.requireGame(this.prisma, gameId);
    this.assertParticipant(
      existing.player1Id,
      existing.player2Id,
      userId,
      'You can only reset a game you are playing in',
    );
    return this.insertGame(existing.player1Id, existing.player2Id, targetScore ?? existing.targetScore);
  }

  /** Rolls for the active player. Call only after checking that it is their turn. */
  private async applyRoll(tx: Prisma.TransactionClient, game: GameRecord): Promise<GameRecord> {
    const [die1, die2] = this.dice.rollPair();
    const doubleSix = die1 === DIE_MAX_FACE && die2 === DIE_MAX_FACE;
    return this.save(tx, game, {
      lastDie1: die1,
      lastDie2: die2,
      lastOutcome: doubleSix ? 'DOUBLE_SIX' : 'STANDARD',
      currentRoundScore: doubleSix ? 0 : game.currentRoundScore + die1 + die2,
      ...(doubleSix ? { activePlayerId: otherPlayerId(game, game.activePlayerId) } : {}),
    });
  }

  /**
   * Banks the round for the active player. Call only after checking that it is their turn.
   * @throws BadRequestException when the round has no points to bank.
   */
  private async applyHold(tx: Prisma.TransactionClient, game: GameRecord): Promise<GameRecord> {
    if (game.currentRoundScore === 0) {
      throw new BadRequestException('Cannot hold without points in the current round');
    }

    const playerId = game.activePlayerId;
    const globalScore = globalScoreOf(game, playerId) + game.currentRoundScore;
    const won = globalScore >= game.targetScore;
    const saved = await this.save(tx, game, {
      ...scoreColumn(game, globalScore),
      currentRoundScore: 0,
      ...(won
        ? { status: 'FINISHED' as const, winnerId: playerId, lastOutcome: 'WIN' as const }
        : { activePlayerId: otherPlayerId(game, playerId), lastOutcome: 'HOLD' as const }),
    });

    if (!won) {
      return saved;
    }
    await this.recordFinishedGame(tx, playerId, otherPlayerId(game, playerId));
    // `saved` was read before the win was recorded, so its player profiles still have the old `wins`.
    return this.requireGame(tx, game.id);
  }

  private async insertGame(player1Id: string, player2Id: string, targetScore: number): Promise<GameStateDto> {
    const game = await this.prisma.game.create({
      data: {
        status: 'ACTIVE',
        targetScore,
        player1Id,
        player2Id,
        activePlayerId: player1Id,
        player1GlobalScore: 0,
        player2GlobalScore: 0,
        currentRoundScore: 0,
        version: 1,
      },
      include: gameInclude,
    });
    return toGameState(game);
  }

  /** Read-modify-write for one game. A losing version check rolls the transaction back. */
  private async transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(run);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === WRITE_CONFLICT) {
        throw new ConflictException(STALE_GAME_MESSAGE);
      }
      throw error;
    }
  }

  private async requireGame(db: GameDb, id: string): Promise<GameRecord> {
    const game = await db.game.findUnique({ where: { id }, include: gameInclude });
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    return game;
  }

  private assertPlayersTurn(game: GameRecord, userId: string): void {
    if (game.status !== 'ACTIVE') {
      throw new ConflictException('Game is already finished');
    }
    if (game.activePlayerId !== userId) {
      throw new ForbiddenException('Not your turn');
    }
  }

  /** The AI cannot sign in, so a participant who passes these checks is always its human opponent. */
  private assertAiTurn(game: GameRecord, userId: string): void {
    if (game.status !== 'ACTIVE') {
      throw new ConflictException('Game is already finished');
    }
    this.assertParticipant(
      game.player1Id,
      game.player2Id,
      userId,
      'You can only advance the AI in a game you are playing in',
    );
    if (!playerOf(game, game.activePlayerId).isAi) {
      throw new ForbiddenException("Not the AI player's turn");
    }
  }

  private assertParticipant(player1Id: string, player2Id: string, userId: string, message: string): void {
    if (userId !== player1Id && userId !== player2Id) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * Writes `changes` only if the row still has the version we read, then increments that version.
   * @throws ConflictException when a concurrent action already wrote the row.
   */
  private async save(
    tx: Prisma.TransactionClient,
    game: GameRecord,
    changes: Prisma.GameUpdateManyMutationInput,
  ): Promise<GameRecord> {
    const data: Prisma.GameUpdateManyMutationInput = { ...changes, version: { increment: 1 } };
    const { count } = await tx.game.updateMany({
      where: { id: game.id, version: game.version, status: 'ACTIVE', activePlayerId: game.activePlayerId },
      data,
    });
    if (count !== 1) {
      throw new ConflictException(STALE_GAME_MESSAGE);
    }
    return this.requireGame(tx, game.id);
  }

  private async recordFinishedGame(tx: Prisma.TransactionClient, winnerId: string, loserId: string): Promise<void> {
    await tx.user.update({
      where: { id: winnerId },
      data: { wins: { increment: 1 }, gamesPlayed: { increment: 1 } },
    });
    await tx.user.update({
      where: { id: loserId },
      data: { gamesPlayed: { increment: 1 } },
    });
  }
}

function playerOf(game: GameRecord, playerId: string): GamePlayerRecord {
  if (playerId === game.player1Id) {
    return game.player1;
  }
  if (playerId === game.player2Id) {
    return game.player2;
  }
  throw new Error(`Game ${game.id} has an active player who is not playing`);
}

function otherPlayerId(game: GameRecord, playerId: string): string {
  if (playerId === game.player1Id) {
    return game.player2Id;
  }
  if (playerId === game.player2Id) {
    return game.player1Id;
  }
  throw new Error(`Game ${game.id} has an active player who is not playing`);
}

function globalScoreOf(game: GameRecord, playerId: string): number {
  if (playerId === game.player1Id) {
    return game.player1GlobalScore;
  }
  if (playerId === game.player2Id) {
    return game.player2GlobalScore;
  }
  throw new Error(`Game ${game.id} has an active player who is not playing`);
}

function scoreColumn(
  game: GameRecord,
  globalScore: number,
): { player1GlobalScore: number } | { player2GlobalScore: number } {
  if (game.activePlayerId === game.player1Id) {
    return { player1GlobalScore: globalScore };
  }
  if (game.activePlayerId === game.player2Id) {
    return { player2GlobalScore: globalScore };
  }
  throw new Error(`Game ${game.id} has an active player who is not playing`);
}
