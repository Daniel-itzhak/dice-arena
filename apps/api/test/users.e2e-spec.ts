import { AI_PLAYER_USERNAME, LEADERBOARD_SIZE, LeaderboardSchema, type LeaderboardDto } from '@dice-arena/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, uniqueUsername } from './test-app.js';

/** Far above anything other tests produce, so seeded players occupy the top of the board. */
const SEEDED_WINS = 1_000_000;

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const seededIds: string[] = [];

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: seededIds.splice(0) } } });
    await app.close();
  });

  async function seedPlayer(username: string, wins: number, gamesPlayed: number): Promise<User> {
    const user = await prisma.user.create({ data: { username, passwordHash: '!', wins, gamesPlayed } });
    seededIds.push(user.id);
    return user;
  }

  async function fetchLeaderboard(): Promise<LeaderboardDto> {
    const { body } = await request(app.getHttpServer()).get('/api/users/leaderboard').expect(200);
    return LeaderboardSchema.parse(body);
  }

  describe('GET /api/users/leaderboard', () => {
    it(`publicly lists the top ${LEADERBOARD_SIZE} players by wins with their win rate`, async () => {
      const players: User[] = [];
      for (let i = 0; i <= LEADERBOARD_SIZE; i++) {
        players.push(await seedPlayer(uniqueUsername(), SEEDED_WINS + i, (SEEDED_WINS + i) * 2));
      }

      const { body } = await request(app.getHttpServer()).get('/api/users/leaderboard').expect(200);

      const expected = players
        .slice(1)
        .reverse()
        .map(({ id, username, wins, gamesPlayed }) => ({ id, username, wins, gamesPlayed, winRatePercent: 50 }));
      expect(body).toStrictEqual(expected);
    });

    it('breaks ties in wins by fewer games played, then by username', async () => {
      const tag = uniqueUsername('');
      const mostGames = await seedPlayer(`tieA${tag}`, SEEDED_WINS, SEEDED_WINS * 4);
      const fewestGamesSecondName = await seedPlayer(`tieC${tag}`, SEEDED_WINS, SEEDED_WINS * 3);
      const fewestGamesFirstName = await seedPlayer(`tieB${tag}`, SEEDED_WINS, SEEDED_WINS * 3);

      const top = (await fetchLeaderboard()).slice(0, 3);
      expect(top.map((entry) => entry.id)).toEqual([fewestGamesFirstName.id, fewestGamesSecondName.id, mostGames.id]);
      expect(top.map((entry) => entry.winRatePercent)).toEqual([33.3, 33.3, 25]);
    });

    it('leaves the AI player off the board even when it has the most wins', async () => {
      const ai = await prisma.user.findUniqueOrThrow({ where: { username: AI_PLAYER_USERNAME } });
      await prisma.user.update({ where: { id: ai.id }, data: { wins: SEEDED_WINS * 10, gamesPlayed: SEEDED_WINS * 10 } });
      try {
        const leaderboard = await fetchLeaderboard();
        expect(leaderboard.map((entry) => entry.id)).not.toContain(ai.id);
      } finally {
        await prisma.user.update({ where: { id: ai.id }, data: { wins: ai.wins, gamesPlayed: ai.gamesPlayed } });
      }
    });
  });
});
