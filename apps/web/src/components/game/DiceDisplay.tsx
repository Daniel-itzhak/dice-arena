import type { DiceRoll } from '@dice-arena/shared';
import { useEffect, useState } from 'react';

const TUMBLE_FRAME_MS = 90;

/** Pip positions for each face, as cells of a 3×3 grid numbered 0–8 left to right, top to bottom. */
const PIP_CELLS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const GRID_CELLS = Array.from({ length: 9 }, (_, cell) => cell);

interface DiceDisplayProps {
  /** The server's latest roll, or `null` before the first roll of the game. */
  roll: DiceRoll | null;
  /** A roll request is in flight: tumble placeholder faces until the server's `roll` arrives. */
  rolling: boolean;
  /** The server reported a double six: shake the dice and flash them red. */
  penalty: boolean;
}

export function DiceDisplay({ roll, rolling, penalty }: DiceDisplayProps) {
  const frame = useTumbleFrame(rolling);
  const faces = rolling ? tumbleFaces(frame) : roll;
  const label = diceLabel(roll, rolling);

  return (
    <div>
      <div
        role="img"
        aria-label={label}
        className={`flex items-center justify-center gap-5 rounded-3xl bg-slate-950/60 px-6 py-8 ring-1 ${
          penalty ? 'ring-rose-500/70 motion-safe:animate-penalty motion-reduce:animate-red-flash' : 'ring-slate-800'
        }`}
      >
        <Die face={faces?.[0] ?? null} rolling={rolling} penalty={penalty} />
        <Die face={faces?.[1] ?? null} rolling={rolling} penalty={penalty} />
      </div>
      <p aria-live="polite" className="sr-only">
        {label}
      </p>
    </div>
  );
}

function Die({ face, rolling, penalty }: { face: number | null; rolling: boolean; penalty: boolean }) {
  const pips = face === null ? [] : (PIP_CELLS[face] ?? []);
  const surface =
    face === null ? 'border-2 border-dashed border-slate-700 bg-slate-900' : penalty ? 'bg-rose-100' : 'bg-slate-50';

  return (
    <div
      data-face={face ?? undefined}
      className={`grid size-20 grid-cols-3 grid-rows-3 place-items-center rounded-2xl p-3 shadow-lg shadow-black/40 transition-colors sm:size-24 ${surface} ${
        rolling ? 'motion-safe:animate-tumble' : ''
      }`}
    >
      {GRID_CELLS.map((cell) => (
        <span
          key={cell}
          className={`size-3.5 rounded-full sm:size-4 ${pips.includes(cell) ? (penalty ? 'bg-rose-600' : 'bg-slate-900') : ''}`}
        />
      ))}
    </div>
  );
}

function useTumbleFrame(active: boolean): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    const interval = setInterval(() => setFrame((current) => current + 1), TUMBLE_FRAME_MS);
    return () => clearInterval(interval);
  }, [active]);

  return frame;
}

/** Walks the faces in a fixed order: the client must never produce anything that looks like a real roll. */
function tumbleFaces(frame: number): DiceRoll {
  return [(frame % 6) + 1, ((frame * 5 + 2) % 6) + 1];
}

function diceLabel(roll: DiceRoll | null, rolling: boolean): string {
  if (rolling) {
    return 'Rolling the dice…';
  }
  return roll === null ? 'No dice rolled yet' : `Last roll: ${roll[0]} and ${roll[1]}`;
}
