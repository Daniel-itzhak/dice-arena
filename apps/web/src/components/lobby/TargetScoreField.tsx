import { MAX_TARGET_SCORE, MIN_TARGET_SCORE } from '@dice-arena/shared';
import { useId } from 'react';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { TextField } from '../ui/TextField';
import { resolveTargetScore, TARGET_SCORE_PRESETS, type TargetScoreChoice, type TargetScorePreset } from './targetScore';

type Pill = TargetScorePreset | 'custom';

const PILLS: readonly SegmentedOption<Pill>[] = [
  ...TARGET_SCORE_PRESETS.map((score) => ({ value: score, label: String(score) })),
  { value: 'custom', label: 'Custom' },
];

interface TargetScoreFieldProps {
  value: TargetScoreChoice;
  onChange: (choice: TargetScoreChoice) => void;
  disabled: boolean;
}

export function TargetScoreField({ value, onChange, disabled }: TargetScoreFieldProps) {
  const labelId = useId();
  const result = resolveTargetScore(value);

  function selectPill(pill: Pill): void {
    if (pill !== 'custom') {
      onChange({ kind: 'preset', score: pill });
    } else if (value.kind === 'preset') {
      onChange({ kind: 'custom', input: String(value.score) });
    }
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex w-full max-w-md flex-col gap-3">
      <p id={labelId} className="text-sm font-medium text-slate-300">
        Target Winning Score
      </p>
      <SegmentedControl
        label="Quick-select target score"
        options={PILLS}
        value={value.kind === 'custom' ? 'custom' : value.score}
        onChange={selectPill}
        disabled={disabled}
      />
      {value.kind === 'custom' && (
        <TextField
          label="Custom target score"
          type="number"
          inputMode="numeric"
          min={MIN_TARGET_SCORE}
          max={MAX_TARGET_SCORE}
          step={1}
          autoFocus
          value={value.input}
          onChange={(event) => onChange({ kind: 'custom', input: event.target.value })}
          disabled={disabled}
          error={result.valid ? undefined : result.message}
          hint={`Between ${MIN_TARGET_SCORE} and ${MAX_TARGET_SCORE} points`}
        />
      )}
    </div>
  );
}
