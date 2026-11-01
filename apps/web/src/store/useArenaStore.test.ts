import { beforeEach, describe, expect, it } from 'vitest';
import { SessionError } from '../errors';
import { alice, bob, gameState, robo, seat } from '../test/fixtures';
import { ARENA_STORAGE_KEY, useArenaStore } from './useArenaStore';

function storedState(): unknown {
  const raw = localStorage.getItem(ARENA_STORAGE_KEY);
  if (raw === null) {
    throw new Error('Nothing was persisted');
  }
  const { state }: { state: unknown } = JSON.parse(raw);
  return state;
}

describe('useArenaStore', () => {
  beforeEach(() => {
    useArenaStore.setState(useArenaStore.getInitialState(), true);
    localStorage.clear();
  });

  describe('sessions', () => {
    it('keeps each slot independent so two players can be signed in at once', () => {
      const { setSession } = useArenaStore.getState();
      setSession('slot1', { user: alice, accessToken: 'alice-token' });
      setSession('slot2', { user: bob, accessToken: 'bob-token' });

      expect(useArenaStore.getState()).toMatchObject({
        slot1: { user: alice, token: 'alice-token' },
        slot2: { user: bob, token: 'bob-token', isAiMode: false },
      });
    });

    it.each([
      ['slot2', 'slot1'],
      ['slot1', 'slot2'],
    ] as const)('refuses to sign %s in as the user already holding %s', (slot, other) => {
      const { setSession } = useArenaStore.getState();
      setSession(other, { user: alice, accessToken: 'first-token' });

      expect(() => setSession(slot, { user: alice, accessToken: 'second-token' })).toThrow(SessionError);
      expect(useArenaStore.getState()[slot]).toMatchObject({ user: null, token: null });
    });

    it('lets a slot sign in again as its own user, e.g. after the token expires', () => {
      const { setSession } = useArenaStore.getState();
      setSession('slot1', { user: alice, accessToken: 'old-token' });
      setSession('slot1', { user: alice, accessToken: 'new-token' });

      expect(useArenaStore.getState().slot1.token).toBe('new-token');
    });

    it('puts the AI player in slot2 without a token, and a human sign-in leaves AI mode', () => {
      const { selectAiOpponent, setSession } = useArenaStore.getState();
      selectAiOpponent(robo);
      expect(useArenaStore.getState().slot2).toEqual({ user: robo, token: null, isAiMode: true });

      setSession('slot2', { user: bob, accessToken: 'bob-token' });
      expect(useArenaStore.getState().slot2).toEqual({ user: bob, token: 'bob-token', isAiMode: false });
    });

    it('refuses to treat a human as the AI opponent', () => {
      expect(() => useArenaStore.getState().selectAiOpponent(bob)).toThrow(SessionError);
      expect(useArenaStore.getState().slot2.isAiMode).toBe(false);
    });

    it('clears one slot without touching the other or the game', () => {
      const { setSession, setGame, clearSession } = useArenaStore.getState();
      const game = gameState();
      setSession('slot1', { user: alice, accessToken: 'alice-token' });
      useArenaStore.getState().selectAiOpponent(robo);
      setGame(game);

      clearSession('slot2');

      expect(useArenaStore.getState()).toMatchObject({
        slot1: { user: alice, token: 'alice-token' },
        slot2: { user: null, token: null, isAiMode: false },
        game,
      });
    });
  });

  describe('game', () => {
    it('stores the exact object it is given, with no derived fields', () => {
      const game = gameState({ roundScore: 7, lastRoll: [3, 4], lastOutcome: 'STANDARD', version: 2 });
      useArenaStore.getState().setGame(game);

      expect(useArenaStore.getState().game).toBe(game);
    });

    it('does not lock or unlock actions on its own when the game changes', () => {
      const { setActionLocked, setGame } = useArenaStore.getState();
      setActionLocked(true);
      setGame(gameState({ lastOutcome: 'DOUBLE_SIX', lastRoll: [6, 6], activePlayerId: bob.id }));

      expect(useArenaStore.getState().isActionLocked).toBe(true);
    });
  });

  describe('persistence', () => {
    it('saves both sessions and the game to localStorage, but never the action lock', () => {
      const { setSession, setGame, setActionLocked } = useArenaStore.getState();
      const game = gameState();
      setSession('slot1', { user: alice, accessToken: 'alice-token' });
      setSession('slot2', { user: bob, accessToken: 'bob-token' });
      setGame(game);
      setActionLocked(true);

      expect(storedState()).toEqual({
        slot1: { user: alice, token: 'alice-token' },
        slot2: { user: bob, token: 'bob-token', isAiMode: false },
        game,
      });
    });

    it('restores a valid saved state on rehydration', async () => {
      const saved = {
        slot1: { user: alice, token: 'alice-token' },
        slot2: { user: robo, token: null, isAiMode: true },
        game: gameState({ players: { player1: seat(alice), player2: seat(robo) } }),
      };
      localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify({ state: saved, version: 0 }));

      await useArenaStore.persist.rehydrate();

      expect(useArenaStore.getState()).toMatchObject({ ...saved, isActionLocked: false });
    });

    it('discards saved state that no longer matches the shared contracts', async () => {
      const corrupt = {
        slot1: { user: { id: alice.id }, token: 'alice-token' },
        slot2: { user: null, token: null, isAiMode: false },
        game: null,
      };
      localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify({ state: corrupt, version: 0 }));

      await useArenaStore.persist.rehydrate();

      expect(useArenaStore.getState().slot1).toEqual({ user: null, token: null });
    });
  });
});
