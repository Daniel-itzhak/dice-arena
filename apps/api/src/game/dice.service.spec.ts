import { randomInt } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiceService } from './dice.service.js';

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomInt: vi.fn((min: number, max: number) => actual.randomInt(min, max)),
  };
});

describe('DiceService', () => {
  beforeEach(() => {
    vi.mocked(randomInt).mockClear();
  });

  it('rolls two faces with crypto.randomInt(1, 7)', () => {
    const seen = new Set<number>();

    for (let i = 0; i < 300; i++) {
      const [die1, die2] = new DiceService().rollPair();
      for (const face of [die1, die2]) {
        expect(face).toBeGreaterThanOrEqual(1);
        expect(face).toBeLessThanOrEqual(6);
        expect(Number.isInteger(face)).toBe(true);
        seen.add(face);
      }
    }

    expect(vi.mocked(randomInt).mock.calls).toEqual(Array.from({ length: 600 }, () => [1, 7]));
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
