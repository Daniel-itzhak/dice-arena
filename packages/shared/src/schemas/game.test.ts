import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_SCORE } from '../constants';
import { CreateGameSchema, GameStateSchema, type GameStateDto } from './game';

describe('CreateGameSchema', () => {
  const base = { player1Id: 'u1', player2Id: 'u2', isVsAi: false };

  it('defaults targetScore when omitted', () => {
    expect(CreateGameSchema.parse(base).targetScore).toBe(DEFAULT_TARGET_SCORE);
  });

  it.each([10, 500, 1000])('accepts targetScore %d', (targetScore) => {
    expect(CreateGameSchema.safeParse({ ...base, targetScore }).success).toBe(true);
  });

  it.each([9, 1001, 50.5])('rejects targetScore %j', (targetScore) => {
    expect(CreateGameSchema.safeParse({ ...base, targetScore }).success).toBe(false);
  });

  it('requires isVsAi', () => {
    expect(CreateGameSchema.safeParse({ player1Id: 'u1', player2Id: 'u2' }).success).toBe(false);
  });

  it('rejects a game where both players are the same user', () => {
    const result = CreateGameSchema.safeParse({ ...base, player2Id: 'u1' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['player2Id']);
  });
});

describe('GameStateSchema', () => {
  const freshGame: GameStateDto = {
    id: 'g1',
    status: 'ACTIVE',
    targetScore: 100,
    activePlayerId: 'u1',
    roundScore: 0,
    lastRoll: null,
    lastOutcome: null,
    winnerId: null,
    version: 0,
    players: {
      player1: { id: 'u1', username: 'alice', isAi: false, globalScore: 0 },
      player2: { id: 'u2', username: 'DiceBot', isAi: true, globalScore: 0 },
    },
  };

  it('accepts a freshly created game with null roll, outcome, and winner', () => {
    expect(GameStateSchema.parse(freshGame)).toEqual(freshGame);
  });

  it('accepts a finished game', () => {
    const finished: GameStateDto = {
      ...freshGame,
      status: 'FINISHED',
      lastRoll: [6, 5],
      lastOutcome: 'WIN',
      winnerId: 'u1',
      version: 12,
    };
    expect(GameStateSchema.safeParse(finished).success).toBe(true);
  });

  it.each([[[0, 3]], [[7, 1]], [[1]], [[1, 2, 3]], [[2.5, 3]]])(
    'rejects lastRoll %j',
    (lastRoll) => {
      expect(GameStateSchema.safeParse({ ...freshGame, lastRoll }).success).toBe(false);
    },
  );

  it('rejects unknown statuses and outcomes', () => {
    expect(GameStateSchema.safeParse({ ...freshGame, status: 'PAUSED' }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...freshGame, lastOutcome: 'BUST' }).success).toBe(false);
  });
});
