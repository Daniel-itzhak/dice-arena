import { describe, expect, it } from 'vitest';
import { toGameState, type GameRecord } from './game.mappers.js';

const record: GameRecord = {
  id: 'g1',
  status: 'ACTIVE',
  targetScore: 100,
  player1Id: 'u1',
  player2Id: 'u2',
  activePlayerId: 'u1',
  player1GlobalScore: 12,
  player2GlobalScore: 7,
  currentRoundScore: 9,
  lastDie1: 6,
  lastDie2: 3,
  lastOutcome: 'STANDARD',
  winnerId: null,
  version: 4,
  player1: { id: 'u1', username: 'alice', isAi: false },
  player2: { id: 'u2', username: 'RoboRoller', isAi: true },
};

describe('toGameState', () => {
  it('renames the stored columns onto the public game state', () => {
    expect(toGameState(record)).toStrictEqual({
      id: 'g1',
      status: 'ACTIVE',
      targetScore: 100,
      activePlayerId: 'u1',
      roundScore: 9,
      lastRoll: [6, 3],
      lastOutcome: 'STANDARD',
      winnerId: null,
      version: 4,
      players: {
        player1: { id: 'u1', username: 'alice', isAi: false, globalScore: 12 },
        player2: { id: 'u2', username: 'RoboRoller', isAi: true, globalScore: 7 },
      },
    });
  });

  it('drops stored columns that are not part of the contract', () => {
    const stored = {
      ...record,
      lastDie1: null,
      lastDie2: 4,
      createdAt: new Date(0),
      player1: { ...record.player1, passwordHash: 'secret-hash', wins: 3 },
    };

    const state = toGameState(stored);
    expect(state.lastRoll).toBeNull();
    expect(JSON.stringify(state)).not.toContain('secret-hash');
    expect(JSON.stringify(state)).not.toContain('passwordHash');
    expect(state.players.player1).toStrictEqual({ id: 'u1', username: 'alice', isAi: false, globalScore: 12 });
  });
});
