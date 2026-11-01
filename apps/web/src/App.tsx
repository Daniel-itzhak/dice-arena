import { useState } from 'react';
import { AudioControls } from './components/audio/AudioControls';
import { GameArena } from './components/game/GameArena';
import { LeaderboardModal } from './components/leaderboard/LeaderboardModal';
import { DualAuthPanel } from './components/lobby/DualAuthPanel';
import { SECONDARY_BUTTON } from './components/ui/buttonStyles';
import { useArenaStore } from './store/useArenaStore';

export function App() {
  const game = useArenaStore((state) => state.game);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,var(--color-slate-900),var(--color-slate-950)_60%)]">
      <header className="border-b border-slate-800/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <h1 className="text-2xl font-black tracking-tight">
            Dice <span className="text-amber-300">Arena</span>
          </h1>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <AudioControls />
            <button type="button" onClick={() => setLeaderboardOpen(true)} className={SECONDARY_BUTTON}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" />
              </svg>
              Leaderboard
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        {game === null ? <DualAuthPanel /> : <GameArena game={game} />}
      </main>
      <LeaderboardModal open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </div>
  );
}
