import { AI_PLAYER_USERNAME, type GameStateDto, type PlayerStateDto, type UserDto } from '@dice-arena/shared';

export const alice: UserDto = { id: 'user-alice', username: 'alice', wins: 2, isAi: false };
export const bob: UserDto = { id: 'user-bob', username: 'bob', wins: 0, isAi: false };
export const robo: UserDto = { id: 'user-ai', username: AI_PLAYER_USERNAME, wins: 5, isAi: true };

export function seat({ id, username, isAi, wins }: UserDto, globalScore = 0): PlayerStateDto {
  return { id, username, isAi, wins, globalScore };
}

export function gameState(overrides: Partial<GameStateDto> = {}): GameStateDto {
  return {
    id: 'game-1',
    status: 'ACTIVE',
    targetScore: 100,
    activePlayerId: alice.id,
    roundScore: 0,
    lastRoll: null,
    lastOutcome: null,
    winnerId: null,
    version: 1,
    canWinOnHold: false,
    players: { player1: seat(alice), player2: seat(bob) },
    ...overrides,
  };
}
