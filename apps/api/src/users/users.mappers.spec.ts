import { describe, expect, it } from 'vitest';
import { toLeaderboardEntry, toUserDto, winRatePercent } from './users.mappers.js';

describe('winRatePercent', () => {
  it.each([
    [0, 0, 0],
    [0, 4, 0],
    [1, 8, 12.5],
    [1, 3, 33.3],
    [2, 3, 66.7],
    [5, 5, 100],
  ])('%i wins in %i games is a %d percent win rate', (wins, gamesPlayed, expected) => {
    expect(winRatePercent(wins, gamesPlayed)).toBe(expected);
  });
});

describe('toUserDto', () => {
  it('drops every column that is not part of the public profile', () => {
    const row = { id: 'u1', username: 'alice', wins: 3, isAi: false, passwordHash: '$argon2id$secret', gamesPlayed: 7 };

    expect(toUserDto(row)).toStrictEqual({ id: 'u1', username: 'alice', wins: 3, isAi: false });
  });
});

describe('toLeaderboardEntry', () => {
  it('adds the win rate and drops every other column', () => {
    const row = { id: 'u1', username: 'alice', wins: 2, gamesPlayed: 3, passwordHash: '$argon2id$secret', isAi: false };

    expect(toLeaderboardEntry(row)).toStrictEqual({
      id: 'u1',
      username: 'alice',
      wins: 2,
      gamesPlayed: 3,
      winRatePercent: 66.7,
    });
  });
});
