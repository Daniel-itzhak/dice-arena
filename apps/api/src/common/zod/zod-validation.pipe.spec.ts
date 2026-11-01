import { CreateGameSchema, DEFAULT_TARGET_SCORE } from '@dice-arena/shared';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(CreateGameSchema);

  function rejectionFor(value: unknown): unknown {
    try {
      pipe.transform(value);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return error.getResponse();
      }
      throw error;
    }
    throw new Error('Expected the pipe to reject the value');
  }

  it('returns the parsed value with defaults applied and unknown keys stripped', () => {
    expect(pipe.transform({ player1Id: 'u1', player2Id: 'u2', isVsAi: true, cheat: true })).toEqual({
      player1Id: 'u1',
      player2Id: 'u2',
      isVsAi: true,
      targetScore: DEFAULT_TARGET_SCORE,
    });
  });

  it('reports every invalid field with its path and Zod issue code', () => {
    expect(rejectionFor({ player1Id: 'u1', targetScore: 5 })).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'player2Id', code: 'invalid_type' }),
        expect.objectContaining({ path: 'targetScore', code: 'too_small' }),
        expect.objectContaining({ path: 'isVsAi', code: 'invalid_type' }),
      ]),
    });
  });

  it('uses an empty path when the payload itself has the wrong shape', () => {
    expect(rejectionFor(undefined)).toMatchObject({
      issues: [expect.objectContaining({ path: '', code: 'invalid_type' })],
    });
  });
});
