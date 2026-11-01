export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  /** Accessible name of the group. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** A row of mutually exclusive toggle buttons; the selected one reports `aria-pressed="true"`. */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-950/70 p-1 ring-1 ring-slate-800"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-slate-300 disabled:cursor-not-allowed disabled:opacity-60 ${
              selected ? 'bg-slate-100 text-slate-900 shadow' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
