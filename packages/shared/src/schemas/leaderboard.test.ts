import { describe, expect, it } from 'vitest';
import { LEADERBOARD_SIZE } from '../constants';
import { LeaderboardEntrySchema, LeaderboardSchema } from './leaderboard';

const entry = { id: 'u1', username: 'alice', wins: 2, gamesPlayed: 3, winRatePercent: 66.7 };

describe('LeaderboardEntrySchema', () => {
  it('accepts a well-formed entry', () => {
    expect(LeaderboardEntrySchema.parse(entry)).toEqual(entry);
  });

  it.each([-0.1, 100.1])('rejects a win rate of %j', (winRatePercent) => {
    expect(LeaderboardEntrySchema.safeParse({ ...entry, winRatePercent }).success).toBe(false);
  });

  it('rejects negative or fractional game counts', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...entry, gamesPlayed: -1 }).success).toBe(false);
    expect(LeaderboardEntrySchema.safeParse({ ...entry, wins: 1.5 }).success).toBe(false);
  });
});

describe('LeaderboardSchema', () => {
  it(`holds at most ${LEADERBOARD_SIZE} entries`, () => {
    expect(LeaderboardSchema.safeParse(Array(LEADERBOARD_SIZE).fill(entry)).success).toBe(true);
    expect(LeaderboardSchema.safeParse(Array(LEADERBOARD_SIZE + 1).fill(entry)).success).toBe(false);
  });
});
