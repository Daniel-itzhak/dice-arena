import { LEADERBOARD_SIZE, type LeaderboardDto, type LeaderboardEntryDto } from '@dice-arena/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { usersApi } from '../../api/client';
import { describeError } from '../../errors';
import { useArenaStore } from '../../store/useArenaStore';
import { SLOT_THEMES, type SlotTheme } from '../slotTheme';
import { SECONDARY_BUTTON } from '../ui/buttonStyles';
import { ErrorMessage } from '../ui/ErrorMessage';

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
}

/** Slide-over drawer listing the persistent win records from `GET /api/users/leaderboard`. */
export function LeaderboardModal({ open, onClose }: LeaderboardModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-md border-0 border-l border-slate-800 bg-slate-900 p-0 text-slate-100 shadow-2xl shadow-black transition duration-300 ease-out backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm starting:open:translate-x-12 starting:open:opacity-0"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Hall of fame</p>
            <h2 id={titleId} className="mt-1 text-2xl font-black tracking-tight">
              Leaderboard
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Top {LEADERBOARD_SIZE} players by total wins, saved on the server across sessions.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close leaderboard"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-slate-300"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{open && <LeaderboardStandings />}</div>
      </div>
    </dialog>
  );
}

type Standings = { status: 'loading' } | { status: 'ready'; entries: LeaderboardDto } | { status: 'failed'; message: string };

function LeaderboardStandings() {
  const [standings, setStandings] = useState<Standings>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const player1Id = useArenaStore((state) => state.slot1.user?.id);
  const player2Id = useArenaStore((state) => state.slot2.user?.id);

  useEffect(() => {
    let current = true;
    usersApi.leaderboard().then(
      (entries) => {
        if (current) {
          setStandings({ status: 'ready', entries });
        }
      },
      (error: unknown) => {
        if (current) {
          setStandings({ status: 'failed', message: describeError(error) });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  function refresh(): void {
    setStandings({ status: 'loading' });
    setAttempt((count) => count + 1);
  }

  function slotThemeFor(entry: LeaderboardEntryDto): SlotTheme | null {
    if (entry.id === player1Id) {
      return SLOT_THEMES.slot1;
    }
    return entry.id === player2Id ? SLOT_THEMES.slot2 : null;
  }

  if (standings.status === 'loading') {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading leaderboard…</span>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} aria-hidden="true" className="h-16 animate-pulse rounded-2xl bg-slate-800/60" />
        ))}
      </div>
    );
  }

  if (standings.status === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <ErrorMessage>{standings.message}</ErrorMessage>
        <button type="button" onClick={refresh} className={SECONDARY_BUTTON}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {standings.entries.length === 0 ? (
        <p className="rounded-2xl bg-slate-950/60 px-4 py-8 text-center text-slate-400 ring-1 ring-slate-800">
          No players yet. Register and win a match to claim the top spot.
        </p>
      ) : (
        <ol aria-label="Top players" className="flex flex-col gap-2">
          {standings.entries.map((entry, index) => (
            <LeaderboardRow key={entry.id} entry={entry} rank={index + 1} slotTheme={slotThemeFor(entry)} />
          ))}
        </ol>
      )}
      <button type="button" onClick={refresh} className={`${SECONDARY_BUTTON} self-center`}>
        Refresh
      </button>
    </div>
  );
}

const PODIUM_STYLES: Record<number, string> = {
  1: 'bg-amber-400 text-amber-950',
  2: 'bg-slate-300 text-slate-900',
  3: 'bg-orange-400 text-orange-950',
};

function LeaderboardRow({ entry, rank, slotTheme }: { entry: LeaderboardEntryDto; rank: number; slotTheme: SlotTheme | null }) {
  return (
    <li
      className={`flex items-center gap-4 rounded-2xl px-4 py-3 ring-1 ${
        slotTheme === null ? 'bg-slate-950/50 ring-slate-800' : 'bg-slate-800/60 ring-slate-600'
      }`}
    >
      <span
        aria-label={`Rank ${rank}`}
        className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black tabular-nums ${
          PODIUM_STYLES[rank] ?? 'bg-slate-800 text-slate-300'
        }`}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-semibold">{entry.username}</span>
          {slotTheme !== null && (
            <span
              title={`Signed in as ${slotTheme.label}`}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${slotTheme.chip}`}
            >
              {slotTheme.shortLabel}
            </span>
          )}
        </p>
        <p className="text-xs text-slate-400">
          {entry.gamesPlayed} played · {entry.winRatePercent}% win rate
        </p>
      </div>
      <p className="text-right">
        <span className="block text-2xl font-black tabular-nums text-amber-300">{entry.wins}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {entry.wins === 1 ? 'win' : 'wins'}
        </span>
      </p>
    </li>
  );
}
