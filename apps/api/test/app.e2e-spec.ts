import { AI_PLAYER_USERNAME, AuthCredentialsSchema, type AuthCredentialsDto } from '@dice-arena/shared';
import { Controller, HttpCode, HttpStatus, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AUTH_RATE_LIMIT, AuthThrottle, DEFAULT_RATE_LIMIT } from '../src/common/throttling.js';
import { ZodBody } from '../src/common/zod/zod-body.decorator.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AiPlayerInitializer } from '../src/users/ai-player.initializer.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const VALID_CREDENTIALS = { username: 'alice', password: 'correct-horse' };

/** Stands in for the upcoming auth endpoints so ZodBody and AuthThrottle run through the real HTTP stack. */
@Controller('probe')
class ProbeController {
  @Post('credentials')
  @HttpCode(HttpStatus.OK)
  @AuthThrottle()
  echo(@ZodBody(AuthCredentialsSchema) credentials: AuthCredentialsDto): AuthCredentialsDto {
    return credentials;
  }
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
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

  describe('ZodBody validation', () => {
    it('rejects invalid bodies with a structured list of issues', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/probe/credentials')
        .send({ username: 'a!', password: 'short' })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        message: 'Validation failed',
        issues: expect.arrayContaining([
          expect.objectContaining({ path: 'username' }),
          expect.objectContaining({ path: 'password' }),
        ]),
      });
    });

    it('hands the parsed body to the handler (trimmed, unknown keys stripped)', async () => {
      await request(app.getHttpServer())
        .post('/api/probe/credentials')
        .send({ username: '  alice  ', password: 'correct-horse', isAdmin: true })
        .expect(200, VALID_CREDENTIALS);
    });
  });

  it('publishes Swagger docs whose request bodies come from the shared schemas', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200).expect('Content-Type', /html/);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(body).toMatchObject({
      paths: {
        '/api/health': { get: expect.any(Object) },
        '/api/probe/credentials': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                      username: { minLength: 3, maxLength: 20 },
                      password: { minLength: 8 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
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
      for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
        await request(server).post('/api/probe/credentials').send(VALID_CREDENTIALS).expect(200);
      }

      await request(server).post('/api/probe/credentials').send(VALID_CREDENTIALS).expect(429);
    });
  });
});
