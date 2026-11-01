import { DEFAULT_TARGET_SCORE, TargetScoreSchema } from '@dice-arena/shared';

export const TARGET_SCORE_PRESETS = [50, 100, 200] as const;
export type TargetScorePreset = (typeof TARGET_SCORE_PRESETS)[number];

/** A preset pill, or the raw text of the custom field (kept as typed so the user can edit freely). */
export type TargetScoreChoice = { kind: 'preset'; score: TargetScorePreset } | { kind: 'custom'; input: string };

export const DEFAULT_TARGET_SCORE_CHOICE: TargetScoreChoice = { kind: 'preset', score: DEFAULT_TARGET_SCORE };

export type TargetScoreResult = { valid: true; score: number } | { valid: false; message: string };

/** Validates the choice against the same `TargetScoreSchema` the API applies to `POST /games`. */
export function resolveTargetScore(choice: TargetScoreChoice): TargetScoreResult {
  if (choice.kind === 'custom' && choice.input.trim() === '') {
    return { valid: false, message: 'Enter a target score' };
  }
  const candidate = choice.kind === 'preset' ? choice.score : Number(choice.input);
  const parsed = TargetScoreSchema.safeParse(candidate);
  if (!parsed.success) {
    return { valid: false, message: parsed.error.issues[0]?.message ?? 'Invalid target score' };
  }
  return { valid: true, score: parsed.data };
}
