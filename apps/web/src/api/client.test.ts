import type { GameStateDto } from '@dice-arena/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env';
import { ApiError, ContractError, NetworkError, SessionError } from '../errors';
import { useArenaStore } from '../store/useArenaStore';
import { alice, bob, gameState, robo, seat } from '../test/fixtures';
import { fetchMock, jsonResponse, respondWith, sentRequest } from '../test/http';
import { authApi, gameApi, usersApi } from './client';

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

function signInBothHumans(): void {
  const { setSession } = useArenaStore.getState();
  setSession('slot1', { user: alice, accessToken: 'alice-token' });
  setSession('slot2', { user: bob, accessToken: 'bob-token' });
}

function signInAgainstAi(): void {
  const { setSession, selectAiOpponent } = useArenaStore.getState();
  setSession('slot1', { user: alice, accessToken: 'alice-token' });
  selectAiOpponent(robo);
}

function aiGame(overrides: Partial<GameStateDto> = {}): GameStateDto {
  return gameState({ players: { player1: seat(alice), player2: seat(robo) }, ...overrides });
}

describe('API client', () => {
  beforeEach(() => {
    useArenaStore.setState(useArenaStore.getInitialState(), true);
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('roll and hold', () => {
    it.each([
      ['roll', alice.id, 'Bearer alice-token'],
      ['roll', bob.id, 'Bearer bob-token'],
      ['hold', alice.id, 'Bearer alice-token'],
      ['hold', bob.id, 'Bearer bob-token'],
    ] as const)('%s while %s is active authenticates with %s', async (action, activePlayerId, authorization) => {
      signInBothHumans();
      useArenaStore.getState().setGame(gameState({ activePlayerId, roundScore: 5 }));
      const next = gameState({ activePlayerId, roundScore: 12, lastRoll: [3, 4], lastOutcome: 'STANDARD', version: 2 });
      respondWith(200, next);

      await gameApi[action]();

      expect(sentRequest()).toEqual({
        url: `${env.apiBaseUrl}/games/game-1/${action}`,
        method: 'POST',
        authorization,
        body: undefined,
      });
      expect(useArenaStore.getState().game).toEqual(next);
    });

    it("replaces the game with the server's state, including a turn change only the server decided", async () => {
      signInBothHumans();
      useArenaStore.getState().setGame(gameState({ roundScore: 13, version: 3 }));
      const bust = gameState({
        activePlayerId: bob.id,
        roundScore: 0,
        lastRoll: [6, 6],
        lastOutcome: 'DOUBLE_SIX',
        version: 4,
      });
      respondWith(200, bust);

      const returned = await gameApi.roll();

      expect(returned).toEqual(bust);
      expect(useArenaStore.getState().game).toEqual(bust);
    });

    it('refuses to act for the AI, which has no token, without calling the API', async () => {
      signInAgainstAi();
      const game = aiGame({ activePlayerId: robo.id });
      useArenaStore.getState().setGame(game);

      expect(await rejectionOf(gameApi.roll())).toBeInstanceOf(SessionError);
      expect(await rejectionOf(gameApi.hold())).toBeInstanceOf(SessionError);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(useArenaStore.getState().game).toBe(game);
    });

    it('refuses when there is no game', async () => {
      signInBothHumans();

      expect(await rejectionOf(gameApi.roll())).toBeInstanceOf(SessionError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('aiStep', () => {
    it("authenticates with slot1's token and stores the game without the aiDecision", async () => {
      signInAgainstAi();
      useArenaStore.getState().setGame(aiGame({ activePlayerId: robo.id }));
      const state = aiGame({ activePlayerId: robo.id, roundScore: 9, lastRoll: [4, 5], lastOutcome: 'STANDARD', version: 2 });
      respondWith(200, { ...state, aiDecision: 'ROLL' });

      const step = await gameApi.aiStep();

      expect(step.aiDecision).toBe('ROLL');
      expect(sentRequest()).toMatchObject({
        url: `${env.apiBaseUrl}/games/game-1/ai-step`,
        authorization: 'Bearer alice-token',
      });
      expect(useArenaStore.getState().game).toEqual(state);
    });
  });

  describe('reset', () => {
    it("authenticates with slot1's token even while player 2 is active", async () => {
      signInBothHumans();
      useArenaStore.getState().setGame(gameState({ activePlayerId: bob.id, status: 'ACTIVE' }));
      const rematch = gameState({ id: 'game-2', targetScore: 50 });
      respondWith(201, rematch);

      await gameApi.reset({ targetScore: 50 });

      expect(sentRequest()).toEqual({
        url: `${env.apiBaseUrl}/games/game-1/reset`,
        method: 'POST',
        authorization: 'Bearer alice-token',
        body: { targetScore: 50 },
      });
      expect(useArenaStore.getState().game).toEqual(rematch);
    });

    it('sends an empty body to keep the previous target score', async () => {
      signInBothHumans();
      useArenaStore.getState().setGame(gameState({ status: 'FINISHED', winnerId: alice.id, lastOutcome: 'WIN' }));
      respondWith(201, gameState({ id: 'game-2' }));

      await gameApi.reset();

      expect(sentRequest().body).toEqual({});
    });
  });

  describe('create', () => {
    it("starts a game between the two signed-in humans using slot1's token", async () => {
      signInBothHumans();
      const game = gameState({ targetScore: 50 });
      respondWith(201, game);

      await gameApi.create(50);

      expect(sentRequest()).toEqual({
        url: `${env.apiBaseUrl}/games`,
        method: 'POST',
        authorization: 'Bearer alice-token',
        body: { player1Id: alice.id, player2Id: bob.id, isVsAi: false, targetScore: 50 },
      });
      expect(useArenaStore.getState().game).toEqual(game);
    });

    it('marks the game as vs-AI when slot2 holds the AI player', async () => {
      signInAgainstAi();
      respondWith(201, aiGame());

      await gameApi.create();

      expect(sentRequest().body).toEqual({ player1Id: alice.id, player2Id: robo.id, isVsAi: true });
    });

    it('refuses to start without an opponent', async () => {
      useArenaStore.getState().setSession('slot1', { user: alice, accessToken: 'alice-token' });

      expect(await rejectionOf(gameApi.create())).toBeInstanceOf(SessionError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it("surfaces the server's rejection as an ApiError and keeps the previous game", async () => {
      signInBothHumans();
      const game = gameState();
      useArenaStore.getState().setGame(game);
      respondWith(403, { statusCode: 403, error: 'Forbidden', message: 'Not your turn' });

      const error = await rejectionOf(gameApi.roll());

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 403, message: 'Not your turn', issues: [] });
      expect(useArenaStore.getState().game).toBe(game);
    });

    it('carries validation issues from the API', async () => {
      signInBothHumans();
      useArenaStore.getState().setGame(gameState());
      respondWith(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: [{ path: 'targetScore', message: 'Target score must be at least 10', code: 'too_small' }],
      });

      const error = await rejectionOf(gameApi.reset({ targetScore: 9 }));

      expect(error).toMatchObject({
        status: 400,
        message: 'Validation failed',
        issues: [{ path: 'targetScore', message: 'Target score must be at least 10' }],
      });
    });

    it('rejects a success response that breaks the shared contract and keeps the previous game', async () => {
      signInBothHumans();
      const game = gameState();
      useArenaStore.getState().setGame(game);
      respondWith(200, { ...gameState(), lastRoll: [7, 1] });

      expect(await rejectionOf(gameApi.roll())).toBeInstanceOf(ContractError);
      expect(useArenaStore.getState().game).toBe(game);
    });

    it('reports an unreachable server as a NetworkError', async () => {
      signInBothHumans();
      useArenaStore.getState().setGame(gameState());
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      expect(await rejectionOf(gameApi.roll())).toBeInstanceOf(NetworkError);
    });

    it('ignores a late response for a game the store has already replaced', async () => {
      signInBothHumans();
      useArenaStore.getState().setGame(gameState());
      let respond: (response: Response) => void = () => undefined;
      fetchMock.mockReturnValueOnce(
        new Promise((resolve) => {
          respond = resolve;
        }),
      );

      const rolling = gameApi.roll();
      const rematch = gameState({ id: 'game-2' });
      useArenaStore.getState().setGame(rematch);
      respond(jsonResponse(200, gameState({ roundScore: 7, lastRoll: [3, 4], lastOutcome: 'STANDARD', version: 2 })));
      await rolling;

      expect(useArenaStore.getState().game).toBe(rematch);
    });
  });

  describe('authApi', () => {
    it('signs the chosen slot in without sending any bearer token', async () => {
      const credentials = { username: 'bob', password: 'correct-horse' };
      respondWith(200, { accessToken: 'bob-token', user: bob });

      const user = await authApi.login('slot2', credentials);

      expect(user).toEqual(bob);
      expect(sentRequest()).toEqual({
        url: `${env.apiBaseUrl}/auth/login`,
        method: 'POST',
        authorization: null,
        body: credentials,
      });
      expect(useArenaStore.getState().slot2).toEqual({ user: bob, token: 'bob-token', isAiMode: false });
    });

    it("refuses to sign slot2 in as slot1's user", async () => {
      useArenaStore.getState().setSession('slot1', { user: alice, accessToken: 'alice-token' });
      respondWith(200, { accessToken: 'another-alice-token', user: alice });

      const error = await rejectionOf(authApi.login('slot2', { username: 'alice', password: 'correct-horse' }));

      expect(error).toBeInstanceOf(SessionError);
      expect(useArenaStore.getState().slot2).toEqual({ user: null, token: null, isAiMode: false });
    });
  });

  describe('usersApi', () => {
    it.each([
      ['leaderboard', '/users/leaderboard', [{ id: alice.id, username: 'alice', wins: 2, gamesPlayed: 3, winRatePercent: 66.7 }]],
      ['aiPlayer', '/users/ai', robo],
    ] as const)('%s is a public GET to %s', async (method, path, body) => {
      respondWith(200, body);

      expect(await usersApi[method]()).toEqual(body);
      expect(sentRequest()).toEqual({ url: `${env.apiBaseUrl}${path}`, method: 'GET', authorization: null, body: undefined });
    });

    it('rejects an AI profile that breaks the shared contract', async () => {
      respondWith(200, { id: robo.id, username: robo.username });

      expect(await rejectionOf(usersApi.aiPlayer())).toBeInstanceOf(ContractError);
    });
  });
});
