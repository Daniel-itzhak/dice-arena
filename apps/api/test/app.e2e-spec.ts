import { AI_PLAYER_USERNAME, LEADERBOARD_SIZE } from '@dice-arena/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTH_RATE_LIMIT, DEFAULT_RATE_LIMIT } from '../src/common/throttling.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AiPlayerInitializer } from '../src/users/ai-player.initializer.js';
import { createTestApp, uniqueUsername } from './test-app.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('HTTP hardening', () => {
    it('serves the health check with helmet security headers', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('answers CORS preflights only for configured origins', async () => {
      const allowed = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);
      expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(allowed.headers['access-control-allow-headers']).toBe('Authorization,Content-Type');

      const denied = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  it('publishes Swagger docs whose request and response bodies come from the shared schemas', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200).expect('Content-Type', /html/);
    const { body, text } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    const json = (schema: object): object => ({ content: { 'application/json': { schema } } });
    expect(body).toMatchObject({
      paths: {
        '/api/health': { get: expect.any(Object) },
        '/api/auth/register': {
          post: {
            requestBody: json({
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { minLength: 3, maxLength: 20 },
                password: { minLength: 8 },
              },
            }),
            responses: {
              '201': json({ type: 'object', required: ['accessToken', 'user'] }),
              '400': expect.any(Object),
              '409': expect.any(Object),
              '429': expect.any(Object),
            },
          },
        },
        '/api/auth/login': {
          post: {
            requestBody: json({ required: ['username', 'password'] }),
            responses: {
              '200': json({ required: ['accessToken', 'user'] }),
              '401': expect.any(Object),
            },
          },
        },
        '/api/users/leaderboard': {
          get: {
            responses: {
              '200': json({
                type: 'array',
                maxItems: LEADERBOARD_SIZE,
                items: { required: ['id', 'username', 'wins', 'gamesPlayed', 'winRatePercent'] },
              }),
            },
          },
        },
      },
    });
    expect(text).not.toContain('passwordHash');
  });

  describe('AI player bootstrap', () => {
    it('ensures exactly one AI player exists, even when run again', async () => {
      await app.get(AiPlayerInitializer).onApplicationBootstrap();

      const aiPlayers = await app.get(PrismaService).user.findMany({ where: { isAi: true } });
      expect(aiPlayers).toHaveLength(1);
      expect(aiPlayers[0]).toMatchObject({ username: AI_PLAYER_USERNAME, wins: 0, gamesPlayed: 0 });
    });

    it('refuses to start when a human account holds the AI username', async () => {
      const prisma = app.get(PrismaService);
      await prisma.user.update({ where: { username: AI_PLAYER_USERNAME }, data: { isAi: false } });
      try {
        await expect(app.get(AiPlayerInitializer).onApplicationBootstrap()).rejects.toThrow(
          /reserved for the AI player/,
        );
      } finally {
        await prisma.user.update({ where: { username: AI_PLAYER_USERNAME }, data: { isAi: true } });
      }
    });
  });

  describe('rate limiting', () => {
    it(`allows ${DEFAULT_RATE_LIMIT.limit} requests per minute per IP, then responds 429`, async () => {
      const server = app.getHttpServer();
      for (let i = 0; i < DEFAULT_RATE_LIMIT.limit; i++) {
        await request(server).get('/api/health').expect(200);
      }

      const blocked = await request(server).get('/api/health').expect(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it(`limits auth endpoints to ${AUTH_RATE_LIMIT.limit} requests per minute`, async () => {
      const server = app.getHttpServer();
      const credentials = { username: uniqueUsername(), password: 'correct-horse' };
      for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
        await request(server).post('/api/auth/login').send(credentials).expect(401);
      }

      await request(server).post('/api/auth/login').send(credentials).expect(429);
    });
  });
});
