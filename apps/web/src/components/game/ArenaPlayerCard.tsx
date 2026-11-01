import type { PlayerStateDto } from '@dice-arena/shared';
import { useId } from 'react';
import { AI_AVATAR, type SlotTheme } from '../slotTheme';

interface ArenaPlayerCardProps {
  player: PlayerStateDto;
  theme: SlotTheme;
  targetScore: number;
  /** The live round total while this player is rolling, otherwise 0. */
  roundScore: number;
  isActive: boolean;
  isWinner: boolean;
  /** This player just rolled a double six: flash their wiped round score. */
  penalized: boolean;
}

export function ArenaPlayerCard({
  player,
  theme,
  targetScore,
  roundScore,
  isActive,
  isWinner,
  penalized,
}: ArenaPlayerCardProps) {
  const nameId = useId();
  const progressPercent = Math.min(100, (player.globalScore / targetScore) * 100);

  return (
    <section
      aria-labelledby={nameId}
      aria-current={isActive ? 'true' : undefined}
      className={`flex flex-col gap-5 rounded-3xl border border-t-4 border-slate-800 ${theme.topBorder} bg-slate-900/70 p-6 shadow-xl shadow-black/30 transition duration-300 ${
        isActive ? `ring-2 ${theme.activeGlow} motion-safe:animate-turn-glow` : ''
      }`}
    >
      <header className="flex min-h-7 items-center justify-between gap-3">
        <p className={`text-xs font-bold uppercase tracking-[0.2em] ${theme.text}`}>{theme.label}</p>
        {isActive && <ActiveTurnIndicator />}
        {isWinner && <WinnerBadge />}
      </header>

      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={`grid size-14 shrink-0 place-items-center rounded-2xl text-xl font-black shadow-lg ${player.isAi ? AI_AVATAR : theme.avatar}`}
        >
          {player.isAi ? 'AI' : player.username.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h3 id={nameId} className="max-w-full truncate text-xl font-bold">
            {player.username}
          </h3>
          <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${theme.chip}`}>
            <TrophyIcon className="size-3.5" />
            {player.wins} career {player.wins === 1 ? 'win' : 'wins'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Global score</span>
          <span className="text-sm tabular-nums text-slate-400">
            <span className={`text-2xl font-black ${theme.text}`}>{player.globalScore}</span> / {targetScore}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${player.username} global score`}
          aria-valuemin={0}
          aria-valuemax={targetScore}
          aria-valuenow={Math.min(player.globalScore, targetScore)}
          aria-valuetext={`${player.globalScore} of ${targetScore} points`}
          className="h-3 overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-700/60"
        >
          <div
            className={`h-full rounded-full ${theme.bar} transition-[width] duration-500 ease-out`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <dl
        className={`rounded-2xl px-4 py-3 ring-1 ${
          penalized
            ? 'ring-rose-500/70 motion-safe:animate-penalty motion-reduce:animate-red-flash'
            : isActive
              ? 'bg-slate-950/70 ring-slate-600'
              : 'bg-slate-950/40 ring-slate-800'
        }`}
      >
        <dt className="text-xs font-semibold uppercase tracking-widest text-slate-500">Current round</dt>
        <dd
          className={`text-4xl font-black tabular-nums ${
            penalized ? 'text-rose-300' : isActive ? 'text-slate-50' : 'text-slate-600'
          }`}
        >
          {roundScore}
        </dd>
      </dl>
    </section>
  );
}

function ActiveTurnIndicator() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/40">
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
      Active Turn
    </span>
  );
}

function WinnerBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-black text-amber-950 shadow-lg shadow-amber-500/30">
      <TrophyIcon className="size-3.5" />
      Winner
    </span>
  );
}

function TrophyIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3"
      />
    </svg>
  );
}
