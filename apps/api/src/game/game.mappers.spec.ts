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
  player1: { id: 'u1', username: 'alice', isAi: false, wins: 3 },
  player2: { id: 'u2', username: 'RoboRoller', isAi: true, wins: 8 },
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
      canWinOnHold: false,
      players: {
        player1: { id: 'u1', username: 'alice', isAi: false, wins: 3, globalScore: 12 },
        player2: { id: 'u2', username: 'RoboRoller', isAi: true, wins: 8, globalScore: 7 },
      },
    });
  });

  it('sets canWinOnHold when the active player would reach the target by holding', () => {
    expect(toGameState({ ...record, targetScore: 21 }).canWinOnHold).toBe(true);
    expect(toGameState({ ...record, player1GlobalScore: 12, currentRoundScore: 8, targetScore: 21 }).canWinOnHold).toBe(
      false,
    );
  });

  it("uses the active player's banked score, not player 1's, for canWinOnHold", () => {
    const player2ToMove = {
      ...record,
      activePlayerId: 'u2',
      player1GlobalScore: 99,
      player2GlobalScore: 7,
      currentRoundScore: 9,
      targetScore: 16,
    };
    expect(toGameState(player2ToMove).canWinOnHold).toBe(true);
    expect(toGameState({ ...player2ToMove, currentRoundScore: 8 }).canWinOnHold).toBe(false);
  });

  it('never sets canWinOnHold on a finished game, even when the winner is already at the target', () => {
    expect(
      toGameState({
        ...record,
        status: 'FINISHED',
        winnerId: 'u1',
        lastOutcome: 'WIN',
        player1GlobalScore: 100,
        currentRoundScore: 0,
      }).canWinOnHold,
    ).toBe(false);
  });

  it('drops stored columns that are not part of the contract', () => {
    const stored = {
      ...record,
      lastDie1: null,
      lastDie2: 4,
      createdAt: new Date(0),
      player1: { ...record.player1, passwordHash: 'secret-hash', gamesPlayed: 9 },
    };

    const state = toGameState(stored);
    expect(state.lastRoll).toBeNull();
    expect(JSON.stringify(state)).not.toContain('secret-hash');
    expect(JSON.stringify(state)).not.toContain('passwordHash');
    expect(state.players.player1).toStrictEqual({ id: 'u1', username: 'alice', isAi: false, wins: 3, globalScore: 12 });
  });
});
