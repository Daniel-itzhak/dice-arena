import { z } from 'zod';
import {
  DEFAULT_TARGET_SCORE,
  DIE_MAX_FACE,
  DIE_MIN_FACE,
  MAX_TARGET_SCORE,
  MIN_TARGET_SCORE,
} from '../constants';
import { EntityIdSchema } from './common';

export const GameStatusSchema = z.enum(['ACTIVE', 'FINISHED']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

/** Result of the most recent action; `null` before the first action of a game. */
export const RollOutcomeSchema = z.enum(['STANDARD', 'DOUBLE_SIX', 'HOLD', 'WIN']).nullable();
export type RollOutcome = z.infer<typeof RollOutcomeSchema>;

export const TargetScoreSchema = z
  .int('Target score must be a whole number')
  .min(MIN_TARGET_SCORE, `Target score must be at least ${MIN_TARGET_SCORE}`)
  .max(MAX_TARGET_SCORE, `Target score must be at most ${MAX_TARGET_SCORE}`);

export const ScoreSchema = z.int().nonnegative();

export const DieFaceSchema = z.int().min(DIE_MIN_FACE).max(DIE_MAX_FACE);
export const DiceRollSchema = z.tuple([DieFaceSchema, DieFaceSchema]);
export type DiceRoll = z.infer<typeof DiceRollSchema>;

export const CreateGameSchema = z
  .object({
    player1Id: EntityIdSchema,
    player2Id: EntityIdSchema,
    targetScore: TargetScoreSchema.default(DEFAULT_TARGET_SCORE),
    isVsAi: z.boolean(),
  })
  .refine((game) => game.player1Id !== game.player2Id, {
    error: 'player1Id and player2Id must be different users',
    path: ['player2Id'],
  });
/** Request body as sent by a client; `targetScore` may be omitted. */
export type CreateGameInput = z.input<typeof CreateGameSchema>;
/** Parsed request body with defaults applied. */
export type CreateGameDto = z.output<typeof CreateGameSchema>;

/** Body of a rematch request. Omit `targetScore` to keep the previous game's target. */
export const ResetGameSchema = z.object({
  targetScore: TargetScoreSchema.optional(),
});
export type ResetGameInput = z.input<typeof ResetGameSchema>;
export type ResetGameDto = z.output<typeof ResetGameSchema>;

export const PlayerStateSchema = z.object({
  /** User id; this is the value that `activePlayerId` and `winnerId` reference. */
  id: EntityIdSchema,
  username: z.string(),
  isAi: z.boolean(),
  /** Career wins across every game; already includes this game once it has been won. */
  wins: z.int().nonnegative(),
  globalScore: ScoreSchema,
});
export type PlayerStateDto = z.infer<typeof PlayerStateSchema>;

export const GameStateSchema = z.object({
  id: EntityIdSchema,
  status: GameStatusSchema,
  targetScore: TargetScoreSchema,
  activePlayerId: EntityIdSchema,
  roundScore: ScoreSchema,
  lastRoll: DiceRollSchema.nullable(),
  lastOutcome: RollOutcomeSchema,
  winnerId: EntityIdSchema.nullable(),
  /** Incremented on every state mutation; used for optimistic concurrency control. */
  version: z.int().nonnegative(),
  /**
   * Server-computed: the active player would win if they held now
   * (`globalScore + roundScore >= targetScore`). The client must not recompute this.
   */
  canWinOnHold: z.boolean(),
  players: z.object({
    player1: PlayerStateSchema,
    player2: PlayerStateSchema,
  }),
});
export type GameStateDto = z.infer<typeof GameStateSchema>;

export const AiDecisionSchema = z.enum(['ROLL', 'HOLD']);
export type AiDecision = z.infer<typeof AiDecisionSchema>;

/** The game after one AI action, plus which action the AI chose. */
export const AiStepResponseSchema = GameStateSchema.extend({
  aiDecision: AiDecisionSchema,
});
export type AiStepResponseDto = z.infer<typeof AiStepResponseSchema>;
