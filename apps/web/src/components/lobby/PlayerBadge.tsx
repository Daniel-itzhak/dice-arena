import type { UserDto } from '@dice-arena/shared';
import type { ReactNode } from 'react';
import { AI_AVATAR, type SlotTheme } from '../slotTheme';

interface PlayerBadgeProps {
  user: UserDto;
  theme: SlotTheme;
  description: string;
  /** Rendered under the stats, e.g. a "Switch Account" button. */
  children?: ReactNode;
}

export function PlayerBadge({ user, theme, description, children }: PlayerBadgeProps) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={`grid size-14 shrink-0 place-items-center rounded-2xl text-xl font-black shadow-lg ${user.isAi ? AI_AVATAR : theme.avatar}`}
        >
          {user.isAi ? 'AI' : user.username.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{user.username}</p>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
      </div>
      <dl className="rounded-2xl bg-slate-950/60 px-4 py-3 ring-1 ring-slate-800">
        <dt className="text-xs font-semibold uppercase tracking-widest text-slate-500">Total wins</dt>
        <dd className={`text-3xl font-black tabular-nums ${theme.text}`}>{user.wins}</dd>
      </dl>
      {children}
    </div>
  );
}
