import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_SCORE } from '../constants';
import {
  AiStepResponseSchema,
  CreateGameSchema,
  GameStateSchema,
  ResetGameSchema,
  type GameStateDto,
} from './game';

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

  it.each([
    [50.5, 'Target score must be a whole number'],
    [Number.NaN, 'Target score must be a whole number'],
    [9, 'Target score must be at least 10'],
    [1001, 'Target score must be at most 1000'],
  ])('explains why targetScore %j is rejected', (targetScore, message) => {
    const result = CreateGameSchema.safeParse({ ...base, targetScore });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([message]);
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

describe('ResetGameSchema', () => {
  it('allows an empty body so the previous target score can be kept', () => {
    expect(ResetGameSchema.parse({})).toEqual({});
  });

  it('accepts a replacement target score and strips unknown keys', () => {
    expect(ResetGameSchema.parse({ targetScore: 50, again: true })).toEqual({ targetScore: 50 });
  });

  it.each([9, 1001, 10.5, null])('rejects targetScore %j', (targetScore) => {
    expect(ResetGameSchema.safeParse({ targetScore }).success).toBe(false);
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
    canWinOnHold: false,
    players: {
      player1: { id: 'u1', username: 'alice', isAi: false, wins: 3, globalScore: 0 },
      player2: { id: 'u2', username: 'DiceBot', isAi: true, wins: 0, globalScore: 0 },
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

  it.each([undefined, -1, 1.5])('rejects player wins %j', (wins) => {
    const players = { ...freshGame.players, player1: { ...freshGame.players.player1, wins } };
    expect(GameStateSchema.safeParse({ ...freshGame, players }).success).toBe(false);
  });

  it('rejects unknown statuses and outcomes', () => {
    expect(GameStateSchema.safeParse({ ...freshGame, status: 'PAUSED' }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...freshGame, lastOutcome: 'BUST' }).success).toBe(false);
  });

  it.each([undefined, 'yes', 1])('rejects canWinOnHold %j', (canWinOnHold) => {
    expect(GameStateSchema.safeParse({ ...freshGame, canWinOnHold }).success).toBe(false);
  });

  describe('AiStepResponseSchema', () => {
    it.each(['ROLL', 'HOLD'] as const)('accepts the game state with aiDecision %s', (aiDecision) => {
      const step = { ...freshGame, lastRoll: [3, 4], lastOutcome: 'STANDARD', aiDecision };
      expect(AiStepResponseSchema.parse(step)).toEqual(step);
    });

    it('requires a known aiDecision', () => {
      expect(AiStepResponseSchema.safeParse(freshGame).success).toBe(false);
      expect(AiStepResponseSchema.safeParse({ ...freshGame, aiDecision: 'PASS' }).success).toBe(false);
    });

    it('still reads as a plain game state', () => {
      const step = AiStepResponseSchema.parse({ ...freshGame, aiDecision: 'ROLL' });
      expect(GameStateSchema.parse(step)).toEqual(freshGame);
    });
  });
});
