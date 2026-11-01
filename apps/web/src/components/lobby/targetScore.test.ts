import { DEFAULT_TARGET_SCORE, MAX_TARGET_SCORE, MIN_TARGET_SCORE } from '@dice-arena/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_SCORE_CHOICE, resolveTargetScore, TARGET_SCORE_PRESETS } from './targetScore';

describe('resolveTargetScore', () => {
  it('starts on the shared default', () => {
    expect(resolveTargetScore(DEFAULT_TARGET_SCORE_CHOICE)).toEqual({ valid: true, score: DEFAULT_TARGET_SCORE });
  });

  it.each(TARGET_SCORE_PRESETS)('accepts the %d preset', (score) => {
    expect(resolveTargetScore({ kind: 'preset', score })).toEqual({ valid: true, score });
  });

  it.each([
    [String(MIN_TARGET_SCORE), MIN_TARGET_SCORE],
    [String(MAX_TARGET_SCORE), MAX_TARGET_SCORE],
    [' 250 ', 250],
  ])('accepts custom input %j as %d', (input, score) => {
    expect(resolveTargetScore({ kind: 'custom', input })).toEqual({ valid: true, score });
  });

  it.each([
    ['', 'Enter a target score'],
    ['   ', 'Enter a target score'],
    ['9', 'Target score must be at least 10'],
    ['1001', 'Target score must be at most 1000'],
    ['50.5', 'Target score must be a whole number'],
    ['abc', 'Target score must be a whole number'],
  ])('rejects custom input %j with the shared message', (input, message) => {
    expect(resolveTargetScore({ kind: 'custom', input })).toEqual({ valid: false, message });
  });
});
