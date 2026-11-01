import type { LeaderboardEntryDto, UserDto } from '@dice-arena/shared';
import type { User } from '../generated/prisma/client.js';

/** Copies fields one by one so a wider Prisma `select` can never leak `passwordHash` into a response. */
export function toUserDto(user: Pick<User, 'id' | 'username' | 'wins' | 'isAi'>): UserDto {
  return { id: user.id, username: user.username, wins: user.wins, isAi: user.isAi };
}

export function toLeaderboardEntry(user: Pick<User, 'id' | 'username' | 'wins' | 'gamesPlayed'>): LeaderboardEntryDto {
  return {
    id: user.id,
    username: user.username,
    wins: user.wins,
    gamesPlayed: user.gamesPlayed,
    winRatePercent: winRatePercent(user.wins, user.gamesPlayed),
  };
}

/** Rounded to one decimal place; 0 for players who have not finished a game yet. */
export function winRatePercent(wins: number, gamesPlayed: number): number {
  if (gamesPlayed === 0) {
    return 0;
  }
  return Math.round((wins / gamesPlayed) * 1000) / 10;
}
