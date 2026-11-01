import { describe, expect, it } from 'vitest';
import { AiStrategyService, type AiTurnState } from './ai-strategy.service.js';

const strategy = new AiStrategyService();

function turn(overrides: Partial<AiTurnState>): AiTurnState {
  return { targetScore: 100, aiScore: 0, opponentScore: 0, roundScore: 0, ...overrides };
}

describe('AiStrategyService', () => {
  it('always rolls at the start of a round, even when the opponent is about to win', () => {
    expect(strategy.decide(turn({}))).toBe('ROLL');
    expect(strategy.decide(turn({ aiScore: 99, opponentScore: 99 }))).toBe('ROLL');
  });

  it.each([
    ['exactly reaches', { aiScore: 90, roundScore: 10 }],
    ['passes', { aiScore: 95, roundScore: 11 }],
    ['reaches from zero', { targetScore: 10, roundScore: 12 }],
  ])('holds as soon as the round %s the target, well below any threshold', (_, state) => {
    expect(strategy.decide(turn(state))).toBe('HOLD');
  });

  describe('normal turn', () => {
    it.each([
      [2, 'ROLL'],
      [20, 'ROLL'],
      [21, 'HOLD'],
      [30, 'HOLD'],
    ] as const)('with a round of %i it decides %s', (roundScore, decision) => {
      expect(strategy.decide(turn({ opponentScore: 50, roundScore }))).toBe(decision);
    });

    it('stays at the normal threshold while the opponent needs 19 or more', () => {
      expect(strategy.holdThreshold(100, 81)).toBe(21);
      expect(strategy.decide(turn({ opponentScore: 81, roundScore: 21 }))).toBe('HOLD');
    });
  });

  describe('when the opponent is within 18 points of the target', () => {
    it.each([82, 90, 99])('raises the threshold to 32 with the opponent on %i', (opponentScore) => {
      expect(strategy.holdThreshold(100, opponentScore)).toBe(32);
    });

    it.each([
      [21, 'ROLL'],
      [31, 'ROLL'],
      [32, 'HOLD'],
    ] as const)('with a round of %i it decides %s', (roundScore, decision) => {
      expect(strategy.decide(turn({ opponentScore: 82, roundScore }))).toBe(decision);
    });

    it('keeps rolling until it wins when the target is closer than 32', () => {
      const pressured = { aiScore: 75, opponentScore: 90 };
      expect(strategy.decide(turn({ ...pressured, roundScore: 24 }))).toBe('ROLL');
      expect(strategy.decide(turn({ ...pressured, roundScore: 25 }))).toBe('HOLD');
    });

    it('is under pressure from the first roll on a target of 18 or less', () => {
      expect(strategy.holdThreshold(18, 0)).toBe(32);
    });
  });
});
