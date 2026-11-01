import { GameStateSchema, UserSchema, type AuthResponseDto, type GameStateDto, type UserDto } from '@dice-arena/shared';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SessionError } from '../errors';

export interface PlayerSlot {
  user: UserDto | null;
  token: string | null;
}

export interface OpponentSlot extends PlayerSlot {
  /** `user` is the built-in AI player, which never has a token; its turns are played through `ai-step`. */
  isAiMode: boolean;
}

export type SlotId = 'slot1' | 'slot2';

export interface ArenaState {
  slot1: PlayerSlot;
  slot2: OpponentSlot;
  /** The latest `GameStateDto` returned by the API, stored exactly as received. */
  game: GameStateDto | null;
  /** Blocks game actions during dice animations and the double-six penalty lockout. Never persisted. */
  isActionLocked: boolean;
}

export interface ArenaActions {
  /** @throws SessionError when the other slot is already signed in as the same user. */
  setSession(slot: SlotId, session: AuthResponseDto): void;
  clearSession(slot: SlotId): void;
  /** @throws SessionError when `ai` is not the AI player. */
  selectAiOpponent(ai: UserDto): void;
  /**
   * Stores the server's `GameStateDto` as received. When `status === 'FINISHED'`, copies
   * `players.*.wins` onto the matching slots so lobby badges stay in sync with the API.
   */
  setGame(game: GameStateDto | null): void;
  setActionLocked(locked: boolean): void;
}

export type ArenaStore = ArenaState & ArenaActions;

export const ARENA_STORAGE_KEY = 'dice-arena:sessions';

const EMPTY_SLOT: PlayerSlot = { user: null, token: null };
const EMPTY_OPPONENT_SLOT: OpponentSlot = { ...EMPTY_SLOT, isAiMode: false };

const PlayerSlotSchema = z.object({
  user: UserSchema.nullable(),
  token: z.string().min(1).nullable(),
});

/** Anything in localStorage that fails this schema (tampered, or written by an older build) is discarded. */
const PersistedArenaSchema = z.object({
  slot1: PlayerSlotSchema,
  slot2: PlayerSlotSchema.extend({ isAiMode: z.boolean() }),
  game: GameStateSchema.extend({ canWinOnHold: z.boolean().default(false) }).nullable(),
});

function otherSlot(slot: SlotId): SlotId {
  return slot === 'slot1' ? 'slot2' : 'slot1';
}

/** Career totals come from the finished game, never from adding 1 on the client. */
function winsFromGame(user: UserDto | null, game: GameStateDto): UserDto | null {
  if (user === null) {
    return null;
  }
  const match = [game.players.player1, game.players.player2].find((player) => player.id === user.id);
  return match === undefined || match.wins === user.wins ? user : { ...user, wins: match.wins };
}

export const useArenaStore = create<ArenaStore>()(
  persist(
    (set, get) => ({
      slot1: EMPTY_SLOT,
      slot2: EMPTY_OPPONENT_SLOT,
      game: null,
      isActionLocked: false,

      setSession: (slot, { user, accessToken }) => {
        if (get()[otherSlot(slot)].user?.id === user.id) {
          throw new SessionError(`${user.username} is already signed in as the other player`);
        }
        const session: PlayerSlot = { user, token: accessToken };
        set(slot === 'slot1' ? { slot1: session } : { slot2: { ...session, isAiMode: false } });
      },

      clearSession: (slot) => {
        set(slot === 'slot1' ? { slot1: EMPTY_SLOT } : { slot2: EMPTY_OPPONENT_SLOT });
      },

      selectAiOpponent: (ai) => {
        if (!ai.isAi) {
          throw new SessionError(`${ai.username} is not the AI player`);
        }
        set({ slot2: { user: ai, token: null, isAiMode: true } });
      },

      setGame: (game) => {
        if (game === null || game.status !== 'FINISHED') {
          set({ game });
          return;
        }
        const { slot1, slot2 } = get();
        set({
          game,
          slot1: { ...slot1, user: winsFromGame(slot1.user, game) },
          slot2: { ...slot2, user: winsFromGame(slot2.user, game) },
        });
      },

      setActionLocked: (isActionLocked) => {
        set({ isActionLocked });
      },
    }),
    {
      name: ARENA_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ slot1, slot2, game }) => ({ slot1, slot2, game }),
      merge: (persisted, current) => {
        const restored = PersistedArenaSchema.safeParse(persisted);
        return restored.success ? { ...current, ...restored.data } : current;
      },
    },
  ),
);
