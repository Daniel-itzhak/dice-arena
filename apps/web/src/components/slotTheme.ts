import type { SlotId } from '../store/useArenaStore';

export interface SlotTheme {
  label: string;
  /** Short form for chips, e.g. on the leaderboard. */
  shortLabel: string;
  text: string;
  topBorder: string;
  avatar: string;
  chip: string;
}

// Class names are written out in full because Tailwind only generates classes it can find verbatim in source.
export const SLOT_THEMES: Record<SlotId, SlotTheme> = {
  slot1: {
    label: 'Player 1',
    shortLabel: 'P1',
    text: 'text-amber-300',
    topBorder: 'border-t-amber-400',
    avatar: 'bg-amber-400 text-amber-950',
    chip: 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
  },
  slot2: {
    label: 'Player 2',
    shortLabel: 'P2',
    text: 'text-sky-300',
    topBorder: 'border-t-sky-400',
    avatar: 'bg-sky-400 text-sky-950',
    chip: 'bg-sky-400/15 text-sky-300 ring-sky-400/30',
  },
};

export const AI_AVATAR = 'bg-fuchsia-500 text-white';
