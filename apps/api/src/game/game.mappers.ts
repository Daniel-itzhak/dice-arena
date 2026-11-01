import {
  GameStateSchema,
  type DiceRoll,
  type GameStateDto,
  type GameStatus,
  type PlayerStateDto,
  type RollOutcome,
} from '@dice-arena/shared';

export interface GamePlayerRecord {
  id: string;
  username: string;
  isAi: boolean;
  wins: number;
}

/** Columns the game rules read and write, plus the two public player profiles. */
export interface GameRecord {
  id: string;
  status: GameStatus;
  targetScore: number;
  player1Id: string;
  player2Id: string;
  activePlayerId: string;
  player1GlobalScore: number;
  player2GlobalScore: number;
  currentRoundScore: number;
  lastDie1: number | null;
  lastDie2: number | null;
  lastOutcome: RollOutcome;
  winnerId: string | null;
  version: number;
  player1: GamePlayerRecord;
  player2: GamePlayerRecord;
}

function toPlayer(player: GamePlayerRecord, globalScore: number): PlayerStateDto {
  return { id: player.id, username: player.username, isAi: player.isAi, wins: player.wins, globalScore };
}

function toLastRoll(die1: number | null, die2: number | null): DiceRoll | null {
  if (die1 === null || die2 === null) {
    return null;
  }
  return [die1, die2];
}

/** Copies the public game onto the shared contract. Stored columns that are not part of it are dropped. */
export function toGameState(game: GameRecord): GameStateDto {
  return GameStateSchema.parse({
    id: game.id,
    status: game.status,
    targetScore: game.targetScore,
    activePlayerId: game.activePlayerId,
    roundScore: game.currentRoundScore,
    lastRoll: toLastRoll(game.lastDie1, game.lastDie2),
    lastOutcome: game.lastOutcome,
    winnerId: game.winnerId,
    version: game.version,
    players: {
      player1: toPlayer(game.player1, game.player1GlobalScore),
      player2: toPlayer(game.player2, game.player2GlobalScore),
    },
  });
}
