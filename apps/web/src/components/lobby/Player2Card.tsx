import { AI_PLAYER_USERNAME } from '@dice-arena/shared';
import { useRef, useState } from 'react';
import { usersApi } from '../../api/client';
import { describeError } from '../../errors';
import { useArenaStore, type OpponentSlot } from '../../store/useArenaStore';
import { SLOT_THEMES } from '../slotTheme';
import { SECONDARY_BUTTON } from '../ui/buttonStyles';
import { ErrorMessage } from '../ui/ErrorMessage';
import { SegmentedControl } from '../ui/SegmentedControl';
import { AuthForm } from './AuthForm';
import { PlayerBadge } from './PlayerBadge';
import { PlayerCard } from './PlayerCard';
import { isOpponentReady } from './readiness';

type OpponentMode = 'human' | 'ai';

const OPPONENT_MODES = [
  { value: 'human', label: 'Human Player 2' },
  { value: 'ai', label: `AI Opponent (${AI_PLAYER_USERNAME})` },
] as const;

type AiLoad = { status: 'idle' } | { status: 'loading' } | { status: 'failed'; message: string };

const theme = SLOT_THEMES.slot2;

export function Player2Card() {
  const slot2 = useArenaStore((state) => state.slot2);
  const clearSession = useArenaStore((state) => state.clearSession);
  const [mode, setMode] = useState<OpponentMode>(slot2.isAiMode ? 'ai' : 'human');
  const [aiLoad, setAiLoad] = useState<AiLoad>({ status: 'idle' });
  /** Bumped on every mode change so a slow AI lookup cannot land after the user switched back to human. */
  const aiRequestId = useRef(0);

  async function loadAiOpponent(): Promise<void> {
    const requestId = ++aiRequestId.current;
    setAiLoad({ status: 'loading' });
    try {
      const ai = await usersApi.aiPlayer();
      if (requestId === aiRequestId.current) {
        useArenaStore.getState().selectAiOpponent(ai);
        setAiLoad({ status: 'idle' });
      }
    } catch (error) {
      if (requestId === aiRequestId.current) {
        setAiLoad({ status: 'failed', message: describeError(error) });
      }
    }
  }

  function changeMode(next: OpponentMode): void {
    if (next === mode) {
      return;
    }
    setMode(next);
    aiRequestId.current++;
    setAiLoad({ status: 'idle' });
    clearSession('slot2');
    if (next === 'ai') {
      void loadAiOpponent();
    }
  }

  return (
    <PlayerCard theme={theme} ready={isOpponentReady(slot2)}>
      <SegmentedControl label="Player 2 type" options={OPPONENT_MODES} value={mode} onChange={changeMode} />
      {mode === 'human' ? (
        <HumanOpponent slot2={slot2} />
      ) : (
        <AiOpponent slot2={slot2} aiLoad={aiLoad} onRetry={() => void loadAiOpponent()} />
      )}
    </PlayerCard>
  );
}

function HumanOpponent({ slot2 }: { slot2: OpponentSlot }) {
  const slot1User = useArenaStore((state) => state.slot1.user);
  const clearSession = useArenaStore((state) => state.clearSession);

  if (slot2.user === null) {
    return (
      <AuthForm
        slot="slot2"
        playerLabel={theme.label}
        otherPlayer={slot1User && { username: slot1User.username, label: SLOT_THEMES.slot1.label }}
      />
    );
  }
  return (
    <PlayerBadge user={slot2.user} theme={theme} description="Signed in on this device">
      <button type="button" onClick={() => clearSession('slot2')} className={`${SECONDARY_BUTTON} mt-auto`}>
        Switch Account
      </button>
    </PlayerBadge>
  );
}

function AiOpponent({ slot2, aiLoad, onRetry }: { slot2: OpponentSlot; aiLoad: AiLoad; onRetry: () => void }) {
  if (slot2.isAiMode && slot2.user !== null) {
    return <PlayerBadge user={slot2.user} theme={theme} description="Server-side AI. Its turns play automatically." />;
  }
  if (aiLoad.status === 'loading') {
    return (
      <p role="status" className="animate-pulse rounded-2xl bg-slate-950/60 px-4 py-6 text-center text-slate-400">
        Summoning {AI_PLAYER_USERNAME}…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {aiLoad.status === 'failed' && <ErrorMessage>{aiLoad.message}</ErrorMessage>}
      <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
        {aiLoad.status === 'failed' ? 'Try again' : `Load ${AI_PLAYER_USERNAME}`}
      </button>
    </div>
  );
}
