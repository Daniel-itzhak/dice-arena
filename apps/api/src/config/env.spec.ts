import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('validateEnv', () => {
  it('needs no configuration for local development', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: `file:${resolve(API_ROOT, 'prisma/dev.db')}`,
      CORS_ORIGINS: ['http://localhost:5173'],
      SWAGGER_ENABLED: true,
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
    expect(validateEnv({ NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(false);
    expect(validateEnv({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
    expect(validateEnv({ SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  it('rejects non-SQLite database URLs and out-of-range ports', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgres://localhost/dice' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ PORT: '70000' })).toThrow(/PORT/);
  });
});
