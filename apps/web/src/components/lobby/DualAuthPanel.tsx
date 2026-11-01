import { useId, useState } from 'react';
import { gameApi } from '../../api/client';
import { ApiError, describeError } from '../../errors';
import { useArenaStore, type OpponentSlot, type PlayerSlot } from '../../store/useArenaStore';
import { PRIMARY_BUTTON } from '../ui/buttonStyles';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Player1Card } from './Player1Card';
import { Player2Card } from './Player2Card';
import { isOpponentReady, isSignedIn } from './readiness';
import { TargetScoreField } from './TargetScoreField';
import {
  DEFAULT_TARGET_SCORE_CHOICE,
  resolveTargetScore,
  type TargetScoreChoice,
  type TargetScoreResult,
} from './targetScore';

const UNAUTHORIZED = 401;

/** Match setup: both players sign in on this device (or Player 2 is the AI), then pick a target score. */
export function DualAuthPanel() {
  const configHeadingId = useId();
  const slot1 = useArenaStore((state) => state.slot1);
  const slot2 = useArenaStore((state) => state.slot2);
  const [targetChoice, setTargetChoice] = useState<TargetScoreChoice>(DEFAULT_TARGET_SCORE_CHOICE);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const target = resolveTargetScore(targetChoice);
  const blocker = startBlocker(slot1, slot2, target);

  async function startMatch(): Promise<void> {
    if (!target.valid) {
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      await gameApi.create(target.score);
    } catch (error) {
      setStartError(
        error instanceof ApiError && error.status === UNAUTHORIZED
          ? 'Player 1’s session has expired. Use Switch Account to sign in again.'
          : describeError(error),
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Match setup</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Who’s rolling today?</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          Both players sign in on this device, or Player 2 hands the dice to the AI.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <Player1Card />
        <div aria-hidden="true" className="flex items-center justify-center">
          <span className="grid size-14 place-items-center rounded-full bg-slate-900 text-sm font-black tracking-widest text-slate-400 ring-1 ring-slate-700">
            VS
          </span>
        </div>
        <Player2Card />
      </div>

      <section
        aria-labelledby={configHeadingId}
        className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30"
      >
        <h3 id={configHeadingId} className="text-sm font-bold uppercase tracking-[0.2em] text-slate-300">
          Game configuration
        </h3>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <TargetScoreField value={targetChoice} onChange={setTargetChoice} disabled={starting} />
          <div className="flex flex-col gap-2 md:items-end">
            <button
              type="button"
              disabled={blocker !== null || starting}
              onClick={() => void startMatch()}
              className={`${PRIMARY_BUTTON} px-8 py-3 text-lg`}
            >
              {starting ? 'Starting…' : 'Start Match'}
            </button>
            <p aria-live="polite" className="text-sm text-slate-400">
              {blocker ?? matchup(slot1.user?.username, slot2.user?.username, target)}
            </p>
          </div>
        </div>
        {startError !== null && <ErrorMessage>{startError}</ErrorMessage>}
      </section>
    </div>
  );
}

/** Why "Start Match" is disabled, or `null` when the match can start. */
function startBlocker(slot1: PlayerSlot, slot2: OpponentSlot, target: TargetScoreResult): string | null {
  if (!isSignedIn(slot1)) {
    return 'Waiting for Player 1 to sign in';
  }
  if (!isOpponentReady(slot2)) {
    return 'Waiting for Player 2 to sign in or pick the AI';
  }
  if (!target.valid) {
    return 'Choose a valid target score';
  }
  return null;
}

function matchup(player1: string | undefined, player2: string | undefined, target: TargetScoreResult): string | null {
  if (player1 === undefined || player2 === undefined || !target.valid) {
    return null;
  }
  return `${player1} vs ${player2} · first to ${target.score}`;
}
