import { describe, expect, it } from 'vitest';
import { AuthCredentialsSchema, AuthResponseSchema } from './auth';

describe('AuthCredentialsSchema', () => {
  it.each(['abc', 'Player1', 'a'.repeat(20)])('accepts username %j', (username) => {
    expect(AuthCredentialsSchema.safeParse({ username, password: 'secret123' }).success).toBe(true);
  });

  it.each(['ab', 'a'.repeat(21), 'bad name', 'bad_name', 'émile', ''])(
    'rejects username %j',
    (username) => {
      expect(AuthCredentialsSchema.safeParse({ username, password: 'secret123' }).success).toBe(
        false,
      );
    },
  );

  it('trims surrounding whitespace from the username', () => {
    expect(AuthCredentialsSchema.parse({ username: '  alice  ', password: 'secret123' })).toEqual({
      username: 'alice',
      password: 'secret123',
    });
  });

  it('requires a password of at least 8 characters', () => {
    expect(AuthCredentialsSchema.safeParse({ username: 'alice', password: '1234567' }).success).toBe(
      false,
    );
    expect(AuthCredentialsSchema.safeParse({ username: 'alice', password: '12345678' }).success).toBe(
      true,
    );
  });
});

describe('AuthResponseSchema', () => {
  it('accepts a well-formed response', () => {
    const response = {
      accessToken: 'jwt.token.value',
      user: { id: 'u1', username: 'alice', wins: 3, isAi: false },
    };
    expect(AuthResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects negative or fractional win counts', () => {
    for (const wins of [-1, 1.5]) {
      const response = {
        accessToken: 'jwt.token.value',
        user: { id: 'u1', username: 'alice', wins, isAi: false },
      };
      expect(AuthResponseSchema.safeParse(response).success).toBe(false);
    }
  });
});
