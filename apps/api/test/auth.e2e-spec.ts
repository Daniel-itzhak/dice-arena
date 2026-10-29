import { AI_PLAYER_USERNAME, AuthResponseSchema } from '@dice-arena/shared';
import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import type { AuthenticatedUser } from '../src/auth/authenticated-user.js';
import { CurrentUser } from '../src/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, uniqueUsername } from './test-app.js';

const PASSWORD = 'correct-horse';
const JWT_EXPIRES_IN_SECONDS = 43_200;

interface AccessTokenClaims {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

/** Exercises JwtAuthGuard and @CurrentUser() until the game endpoints use them. */
@Controller('probe')
class ProbeController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('unguarded')
  unguarded(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp({ imports: [AuthModule], controllers: [ProbeController] });
  });

  afterEach(async () => {
    await app.close();
  });

  const register = (username: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/api/auth/register').send({ username, password });

  const login = (username: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ username, password });

  describe('POST /api/auth/register', () => {
    it('creates the account and returns a signed token with the public profile', async () => {
      const username = uniqueUsername();
      const { body } = await register(username).expect(201);

      const session = AuthResponseSchema.parse(body);
      expect(body.user).toStrictEqual({ id: expect.any(String), username, wins: 0, isAi: false });

      const claims = app.get(JwtService).verify<AccessTokenClaims>(session.accessToken);
      expect(claims).toMatchObject({ sub: session.user.id, username });
      expect(claims.exp - claims.iat).toBe(JWT_EXPIRES_IN_SECONDS);
    });

    it('stores an argon2id hash instead of the password and never returns it', async () => {
      const username = uniqueUsername();
      const response = await register(username).expect(201);

      const stored = await app.get(PrismaService).user.findUniqueOrThrow({ where: { username } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(response.text).not.toContain('passwordHash');
      expect(response.text).not.toContain(stored.passwordHash);
      expect(response.text).not.toContain(PASSWORD);
    });

    it('trims the username and ignores fields that clients may not set', async () => {
      const username = uniqueUsername();
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: `  ${username}  `, password: PASSWORD, isAi: true, wins: 999 })
        .expect(201);

      expect(body.user).toMatchObject({ username, isAi: false, wins: 0 });
    });

    it('rejects malformed credentials with a structured list of issues', async () => {
      const { body } = await register('a!', 'short').expect(400);

      expect(body).toMatchObject({
        statusCode: 400,
        message: 'Validation failed',
        issues: expect.arrayContaining([
          expect.objectContaining({ path: 'username' }),
          expect.objectContaining({ path: 'password' }),
        ]),
      });
    });

    it('responds 409 when the username is already taken', async () => {
      const username = uniqueUsername();
      await register(username).expect(201);

      const { body } = await register(username, 'another-password').expect(409);
      expect(body).toEqual({ statusCode: 409, error: 'Conflict', message: 'Username is already taken' });
    });

    it('treats the AI player username as taken', async () => {
      await register(AI_PLAYER_USERNAME).expect(409);
    });

    it('lets exactly one of two simultaneous registrations for a username succeed', async () => {
      const username = uniqueUsername();
      const responses = await Promise.all([register(username), register(username)]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a new token and the profile for valid credentials', async () => {
      const username = uniqueUsername();
      const { body: registered } = await register(username).expect(201);

      const response = await login(username).expect(200);
      const session = AuthResponseSchema.parse(response.body);
      expect(session.user).toStrictEqual(registered.user);
      expect(app.get(JwtService).verify<AccessTokenClaims>(session.accessToken)).toMatchObject({
        sub: registered.user.id,
        username,
      });
      expect(response.text).not.toContain('passwordHash');
    });

    it('gives the same 401 for a wrong password and an unknown username', async () => {
      const username = uniqueUsername();
      await register(username).expect(201);

      const wrongPassword = await login(username, 'wrong-password').expect(401);
      const unknownUser = await login(uniqueUsername()).expect(401);
      expect(wrongPassword.body).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Invalid username or password' });
      expect(unknownUser.body).toEqual(wrongPassword.body);
    });

    it('never lets anyone sign in as the AI player', async () => {
      await login(AI_PLAYER_USERNAME).expect(401);
    });
  });

  describe('JwtAuthGuard and @CurrentUser()', () => {
    const me = (authorization?: string) => {
      const pending = request(app.getHttpServer()).get('/api/probe/me');
      return authorization === undefined ? pending : pending.set('Authorization', authorization);
    };

    it('injects the user identified by the bearer token', async () => {
      const username = uniqueUsername();
      const { body } = await register(username).expect(201);

      await me(`Bearer ${body.accessToken}`).expect(200, { id: body.user.id, username });
      await me(`bearer ${body.accessToken}`).expect(200);
    });

    it.each([
      ['no Authorization header', undefined],
      ['an empty bearer token', 'Bearer '],
      ['another auth scheme', 'Basic dXNlcjpwYXNz'],
      ['a token with surrounding junk', 'Bearer a.b.c extra'],
    ])('responds 401 to %s', async (_case, authorization) => {
      const { body } = await me(authorization).expect(401);
      expect(body).toMatchObject({ message: 'Missing bearer token' });
    });

    it('responds 401 to tokens that are malformed, expired, forged, unsigned, or lack the user claims', async () => {
      const jwt = app.get(JwtService);
      const claims = { sub: 'some-user-id', username: 'someone' };
      const tokens = [
        'not-a-jwt',
        await jwt.signAsync(claims, { expiresIn: -1 }),
        await jwt.signAsync(claims, { secret: 'an-attacker-chosen-secret-of-32-chars' }),
        `${base64UrlJson({ alg: 'none', typ: 'JWT' })}.${base64UrlJson(claims)}.`,
        await jwt.signAsync({ username: 'no-subject' }),
      ];

      for (const token of tokens) {
        const { body } = await me(`Bearer ${token}`).expect(401);
        expect(body).toMatchObject({ message: 'Invalid or expired access token' });
      }
    });

    it('fails closed when @CurrentUser() is used on a route without the guard', async () => {
      await request(app.getHttpServer()).get('/api/probe/unguarded').expect(500);
    });
  });
});
