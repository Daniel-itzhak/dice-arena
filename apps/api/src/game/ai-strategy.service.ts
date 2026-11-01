import type { AiDecision } from '@dice-arena/shared';
import { Injectable } from '@nestjs/common';

/** Round total at which the AI banks its points in a normal turn. */
const AI_HOLD_THRESHOLD = 21;

/** Round total the AI pushes for once the opponent is close to winning. */
const AI_PRESSURED_HOLD_THRESHOLD = 32;

/** The opponent counts as close to winning when they need at most this many points. */
const AI_PRESSURE_DISTANCE = 18;

/** Everything the AI looks at before choosing its next action. */
export interface AiTurnState {
  targetScore: number;
  /** The AI's banked score, not counting the current round. */
  aiScore: number;
  opponentScore: number;
  roundScore: number;
}

@Injectable()
export class AiStrategyService {
  decide({ targetScore, aiScore, opponentScore, roundScore }: AiTurnState): AiDecision {
    if (aiScore + roundScore >= targetScore) {
      return 'HOLD';
    }
    if (roundScore === 0) {
      return 'ROLL';
    }
    return roundScore >= this.holdThreshold(targetScore, opponentScore) ? 'HOLD' : 'ROLL';
  }

  /**
   * Under pressure the threshold rises, so the AI keeps rolling until it either banks a big round
   * or, when the target is closer than that, reaches the target and wins.
   */
  holdThreshold(targetScore: number, opponentScore: number): number {
    return targetScore - opponentScore <= AI_PRESSURE_DISTANCE ? AI_PRESSURED_HOLD_THRESHOLD : AI_HOLD_THRESHOLD;
  }
}
