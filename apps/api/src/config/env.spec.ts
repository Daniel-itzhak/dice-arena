import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRODUCTION_JWT_SECRET = 'a-production-secret-of-at-least-32-chars';

describe('validateEnv', () => {
  it('needs no configuration for local development', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: `file:${resolve(API_ROOT, 'prisma/dev.db')}`,
      CORS_ORIGINS: ['http://localhost:5173'],
      SWAGGER_ENABLED: true,
      JWT_SECRET: expect.any(String),
      JWT_EXPIRES_IN_SECONDS: 43_200,
    });
  });

  it('anchors relative SQLite paths to the apps/api package and keeps absolute ones', () => {
    expect(validateEnv({ DATABASE_URL: 'file:./data/app.db' }).DATABASE_URL).toBe(
      `file:${resolve(API_ROOT, 'data/app.db')}`,
    );
    expect(validateEnv({ DATABASE_URL: 'file:/var/lib/dice/app.db' }).DATABASE_URL).toBe('file:/var/lib/dice/app.db');
  });

  it('parses a comma-separated list of CORS origins', () => {
    expect(validateEnv({ CORS_ORIGINS: 'http://localhost:5173, https://dice.example.com' }).CORS_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://dice.example.com',
    ]);
  });

  it.each(['http://localhost:5173/', 'https://dice.example.com/app', 'ftp://dice.example.com', 'not a url', ' , '])(
    'rejects CORS_ORIGINS=%j',
    (origins) => {
      expect(() => validateEnv({ CORS_ORIGINS: origins })).toThrow(/CORS_ORIGINS/);
    },
  );

  it('disables Swagger by default in production but honours an explicit override', () => {
    const production = { NODE_ENV: 'production', JWT_SECRET: PRODUCTION_JWT_SECRET };
    expect(validateEnv(production).SWAGGER_ENABLED).toBe(false);
    expect(validateEnv({ ...production, SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
    expect(validateEnv({ SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  it('requires an explicit JWT_SECRET in production instead of falling back to the development one', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(validateEnv({ NODE_ENV: 'production', JWT_SECRET: PRODUCTION_JWT_SECRET }).JWT_SECRET).toBe(
      PRODUCTION_JWT_SECRET,
    );
  });

  it('rejects JWT secrets shorter than 32 characters and non-positive token lifetimes', () => {
    expect(() => validateEnv({ JWT_SECRET: 'x'.repeat(31) })).toThrow(/JWT_SECRET/);
    expect(validateEnv({ JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET).toBe('x'.repeat(32));
    expect(() => validateEnv({ JWT_EXPIRES_IN_SECONDS: '0' })).toThrow(/JWT_EXPIRES_IN_SECONDS/);
    expect(validateEnv({ JWT_EXPIRES_IN_SECONDS: '900' }).JWT_EXPIRES_IN_SECONDS).toBe(900);
  });

  it('rejects non-SQLite database URLs and out-of-range ports', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgres://localhost/dice' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ PORT: '70000' })).toThrow(/PORT/);
  });
});
