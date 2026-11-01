import { useId, type ReactNode } from 'react';
import type { SlotTheme } from '../slotTheme';

interface PlayerCardProps {
  theme: SlotTheme;
  ready: boolean;
  children: ReactNode;
}

export function PlayerCard({ theme, ready, children }: PlayerCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`flex flex-col gap-6 rounded-3xl border border-t-4 border-slate-800 ${theme.topBorder} bg-slate-900/70 p-6 shadow-xl shadow-black/30`}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 id={headingId} className={`text-sm font-bold uppercase tracking-[0.2em] ${theme.text}`}>
          {theme.label}
        </h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
            ready ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' : 'bg-slate-800 text-slate-400 ring-slate-700'
          }`}
        >
          {ready ? 'Ready' : 'Waiting'}
        </span>
      </header>
      {children}
    </section>
  );
}
