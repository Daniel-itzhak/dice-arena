import { z } from 'zod';
import { LEADERBOARD_SIZE } from '../constants';
import { EntityIdSchema } from './common';

export const LeaderboardEntrySchema = z.object({
  id: EntityIdSchema,
  username: z.string(),
  wins: z.int().nonnegative(),
  gamesPlayed: z.int().nonnegative(),
  /** Percentage of played games that were won, rounded to one decimal place; 0 before the first game. */
  winRatePercent: z.number().min(0).max(100),
});
export type LeaderboardEntryDto = z.infer<typeof LeaderboardEntrySchema>;

/** Ranked best first. */
export const LeaderboardSchema = z.array(LeaderboardEntrySchema).max(LEADERBOARD_SIZE);
export type LeaderboardDto = z.infer<typeof LeaderboardSchema>;
