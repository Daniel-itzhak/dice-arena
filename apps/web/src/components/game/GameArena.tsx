import {
  MAX_TARGET_SCORE,
  MIN_TARGET_SCORE,
  type GameStateDto,
  type PlayerStateDto,
  type RollOutcome,
} from '@dice-arena/shared';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { gameApi } from '../../api/client';
import { playDiceRoll, playDoubleSix, playHold, playWin } from '../../audio/soundEngine';
import { describeError } from '../../errors';
import { useArenaStore } from '../../store/useArenaStore';
import { resolveTargetScore } from '../lobby/targetScore';
import { SLOT_THEMES } from '../slotTheme';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles';
import { ErrorMessage } from '../ui/ErrorMessage';
import { TextField } from '../ui/TextField';
import { ArenaPlayerCard } from './ArenaPlayerCard';
import { DiceDisplay } from './DiceDisplay';

export const PENALTY_LOCKOUT_MS = 2000;
export const AI_STEP_DELAY_MS = 950;

type TurnAction = 'roll' | 'hold' | 'ai-step';

const TURN_REQUESTS: Record<TurnAction, () => Promise<GameStateDto>> = {
  roll: () => gameApi.roll(),
  hold: () => gameApi.hold(),
  'ai-step': () => gameApi.aiStep(),
};

/**
 * One sound cue per outcome the server reports. The cue is chosen from the response, never from what
 * the client expected to happen, so the audio can only ever describe the API's decision.
 */
const OUTCOME_SOUNDS: Record<NonNullable<RollOutcome>, () => void> = {
  STANDARD: playDiceRoll,
  DOUBLE_SIX: playDoubleSix,
  HOLD: playHold,
  WIN: playWin,
};

interface GameArenaProps {
  game: GameStateDto;
}

/** The match board. It only renders the server's `GameStateDto` and sends requests; the API applies every rule. */
export function GameArena({ game }: GameArenaProps) {
  const newGameHeadingId = useId();
  const isActionLocked = useArenaStore((state) => state.isActionLocked);
  const setActionLocked = useArenaStore((state) => state.setActionLocked);
  const setGame = useArenaStore((state) => state.setGame);

  const [turnPending, setTurnPending] = useState<TurnAction | null>(null);
  /** The player who rolled the double six, for as long as the penalty lockout lasts. */
  const [penalizedPlayerId, setPenalizedPlayerId] = useState<string | null>(null);
  /** Set when an AI step fails, so playback waits for the user instead of retrying every second. */
  const [aiPaused, setAiPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState(String(game.targetScore));
  const [resetting, setResetting] = useState(false);

  const penaltyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Bumped by every turn request and by a reset; only the latest request may release the lock or report errors. */
  const latestTurnRequest = useRef(0);

  const { player1, player2 } = game.players;
  const isFinished = game.status === 'FINISHED';
  const activePlayer = findPlayer(game, game.activePlayerId);
  const winner = game.winnerId === null ? undefined : findPlayer(game, game.winnerId);
  const penalizedPlayer = penalizedPlayerId === null ? undefined : findPlayer(game, penalizedPlayerId);
  const isAiTurn = game.status === 'ACTIVE' && activePlayer?.isAi === true;
  const turnControlsDisabled = isActionLocked || isFinished || isAiTurn;
  const target = resolveTargetScore({ kind: 'custom', input: targetInput });

  function startPenaltyLockout(playerId: string): void {
    clearTimeout(penaltyTimer.current);
    setActionLocked(true);
    setPenalizedPlayerId(playerId);
    penaltyTimer.current = setTimeout(() => {
      setPenalizedPlayerId(null);
      setActionLocked(false);
    }, PENALTY_LOCKOUT_MS);
  }

  async function playTurn(action: TurnAction): Promise<void> {
    const requestId = ++latestTurnRequest.current;
    const isLatest = () => requestId === latestTurnRequest.current;
    const moverId = game.activePlayerId;
    setActionLocked(true);
    setTurnPending(action);
    setError(null);
    try {
      const next = await TURN_REQUESTS[action]();
      if (!isLatest()) {
        return;
      }
      if (next.lastOutcome !== null) {
        OUTCOME_SOUNDS[next.lastOutcome]();
      }
      if (next.lastOutcome === 'DOUBLE_SIX') {
        startPenaltyLockout(moverId);
      } else {
        setActionLocked(false);
      }
    } catch (caught) {
      if (!isLatest()) {
        return;
      }
      setError(describeError(caught));
      setAiPaused(action === 'ai-step');
      setActionLocked(false);
    } finally {
      if (isLatest()) {
        setTurnPending(null);
      }
    }
  }

  async function startNewGame(): Promise<void> {
    if (!target.valid) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await gameApi.reset({ targetScore: target.score });
      latestTurnRequest.current++;
      clearTimeout(penaltyTimer.current);
      setPenalizedPlayerId(null);
      setTurnPending(null);
      setAiPaused(false);
      setActionLocked(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setResetting(false);
    }
  }

  function resumeAi(): void {
    setError(null);
    setAiPaused(false);
  }

  const playAiStep = useEffectEvent(() => {
    void playTurn('ai-step');
  });

  useEffect(() => {
    if (!isAiTurn || isActionLocked || aiPaused) {
      return;
    }
    const timer = setTimeout(() => playAiStep(), AI_STEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [game.id, game.activePlayerId, game.status, game.version, isAiTurn, isActionLocked, aiPaused]);

  useEffect(
    () => () => {
      latestTurnRequest.current++;
      clearTimeout(penaltyTimer.current);
      setActionLocked(false);
    },
    [setActionLocked],
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="relative text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">First to {game.targetScore} points</p>
        <h2 aria-live="polite" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          <TurnStatus activePlayer={activePlayer} winner={winner} isAiTurn={isAiTurn} aiPaused={aiPaused} />
        </h2>
        {penalizedPlayer !== undefined && <PenaltyBanner penalized={penalizedPlayer} next={activePlayer} />}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,18rem)_1fr] lg:items-start">
        <ArenaPlayerCard
          player={player1}
          theme={SLOT_THEMES.slot1}
          targetScore={game.targetScore}
          roundScore={player1.id === game.activePlayerId ? game.roundScore : 0}
          isActive={!isFinished && player1.id === game.activePlayerId}
          isWinner={player1.id === game.winnerId}
          penalized={player1.id === penalizedPlayerId}
        />

        <section aria-label="Dice and turn controls" className="flex flex-col gap-4">
          <DiceDisplay roll={game.lastRoll} rolling={turnPending === 'roll'} penalty={penalizedPlayer !== undefined} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={turnControlsDisabled}
              onClick={() => void playTurn('roll')}
              className={`${PRIMARY_BUTTON} py-3 text-lg`}
            >
              {turnPending === 'roll' ? 'Rolling…' : 'Roll Dice'}
            </button>
            <button
              type="button"
              disabled={turnControlsDisabled || game.roundScore === 0}
              onClick={() => void playTurn('hold')}
              className={`${SECONDARY_BUTTON} py-3 text-lg`}
            >
              {turnPending === 'hold' ? 'Holding…' : 'Hold'}
            </button>
          </div>
        </section>

        <ArenaPlayerCard
          player={player2}
          theme={SLOT_THEMES.slot2}
          targetScore={game.targetScore}
          roundScore={player2.id === game.activePlayerId ? game.roundScore : 0}
          isActive={!isFinished && player2.id === game.activePlayerId}
          isWinner={player2.id === game.winnerId}
          penalized={player2.id === penalizedPlayerId}
        />
      </div>

      {error !== null && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
          {aiPaused && (
            <button type="button" onClick={resumeAi} className={SECONDARY_BUTTON}>
              Retry {activePlayer?.username ?? 'AI'}’s turn
            </button>
          )}
        </div>
      )}

      <section
        aria-labelledby={newGameHeadingId}
        className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <h3 id={newGameHeadingId} className="sr-only">
            New game
          </h3>
          <div className="sm:w-44">
            <TextField
              label="Target score"
              type="number"
              inputMode="numeric"
              min={MIN_TARGET_SCORE}
              max={MAX_TARGET_SCORE}
              step={1}
              value={targetInput}
              onChange={(event) => setTargetInput(event.target.value)}
              disabled={resetting}
              error={target.valid ? undefined : target.message}
              hint={`Between ${MIN_TARGET_SCORE} and ${MAX_TARGET_SCORE}`}
            />
          </div>
          <button
            type="button"
            disabled={resetting || !target.valid}
            onClick={() => void startNewGame()}
            className={`${PRIMARY_BUTTON} sm:mt-6.5`}
          >
            {resetting ? 'Starting…' : 'New Game'}
          </button>
        </div>
        <button type="button" onClick={() => setGame(null)} className={`${SECONDARY_BUTTON} sm:mt-6.5`}>
          Back to lobby
        </button>
      </section>
    </div>
  );
}

function findPlayer(game: GameStateDto, playerId: string): PlayerStateDto | undefined {
  return [game.players.player1, game.players.player2].find((player) => player.id === playerId);
}

interface TurnStatusProps {
  activePlayer: PlayerStateDto | undefined;
  winner: PlayerStateDto | undefined;
  isAiTurn: boolean;
  aiPaused: boolean;
}

function TurnStatus({ activePlayer, winner, isAiTurn, aiPaused }: TurnStatusProps) {
  if (winner !== undefined) {
    return (
      <>
        <span className="text-amber-300">{winner.username}</span> wins the match!
      </>
    );
  }
  if (activePlayer === undefined) {
    return null;
  }
  if (isAiTurn && !aiPaused) {
    return <span className="motion-safe:animate-pulse">{activePlayer.username} is thinking…</span>;
  }
  return <>{activePlayer.username}’s turn</>;
}

function PenaltyBanner({ penalized, next }: { penalized: PlayerStateDto; next: PlayerStateDto | undefined }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-4">
      <div
        role="alert"
        className="flex max-w-xl flex-col gap-0.5 rounded-2xl bg-rose-600 px-5 py-3 text-center text-white shadow-2xl shadow-rose-950/70 ring-2 ring-rose-300/60 motion-safe:animate-banner-in"
      >
        <p className="text-lg font-black tracking-tight">Snake Eyes 6 &amp; 6! Round score wiped — Turn passed!</p>
        <p className="text-sm text-rose-100">
          {penalized.username} loses the round.{next !== undefined && ` ${next.username} is up.`}
        </p>
      </div>
    </div>
  );
}
