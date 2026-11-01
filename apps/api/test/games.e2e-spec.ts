import {
  AI_PLAYER_USERNAME,
  AiStepResponseSchema,
  AuthResponseSchema,
  GameStateSchema,
  type AiStepResponseDto,
  type DiceRoll,
  type GameStateDto,
} from '@dice-arena/shared';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiceService } from '../src/game/dice.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, uniqueUsername } from './test-app.js';

const PASSWORD = 'correct-horse';

interface Player {
  id: string;
  username: string;
  token: string;
}

let rolls: DiceRoll[] = [];

const dice = {
  rollPair: vi.fn((): DiceRoll => {
    const roll = rolls.shift();
    if (roll === undefined) {
      throw new Error('Game test rolled more times than it scripted');
    }
    return roll;
  }),
};

function script(...next: DiceRoll[]): void {
  rolls = [...next];
}

describe('Games (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    rolls = [];
    dice.rollPair.mockClear();
    app = await createTestApp({
      configure: (builder) => {
        builder.overrideProvider(DiceService).useValue(dice);
      },
    });
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => request(app.getHttpServer());

  async function register(): Promise<Player> {
    const username = uniqueUsername();
    const { body } = await server().post('/api/auth/register').send({ username, password: PASSWORD }).expect(201);
    const session = AuthResponseSchema.parse(body);
    return { id: session.user.id, username, token: session.accessToken };
  }

  function authed(token: string, path: string, body?: object): request.Test {
    const call = server().post(path).set('Authorization', `Bearer ${token}`);
    return body === undefined ? call : call.send(body);
  }

  function stateFrom(response: Response): GameStateDto {
    return GameStateSchema.parse(response.body);
  }

  describe('POST /api/games', () => {
    it('requires a bearer token', async () => {
      const { body } = await server().post('/api/games').expect(401);
      expect(body).toMatchObject({ message: 'Missing bearer token' });
    });

    it('starts a game at zero for a caller who is one of the two distinct, existing players', async () => {
      const player1 = await register();
      const player2 = await register();

      const response = await authed(player1.token, '/api/games', {
        player1Id: player1.id,
        player2Id: player2.id,
        isVsAi: false,
      }).expect(201);

      const state = stateFrom(response);
      expect(state).toMatchObject({
        status: 'ACTIVE',
        targetScore: 100,
        activePlayerId: player1.id,
        roundScore: 0,
        lastRoll: null,
        lastOutcome: null,
        winnerId: null,
        version: 1,
        players: {
          player1: { id: player1.id, username: player1.username, isAi: false, wins: 0, globalScore: 0 },
          player2: { id: player2.id, username: player2.username, isAi: false, wins: 0, globalScore: 0 },
        },
      });
      expect(response.text).not.toContain('passwordHash');

      const row = await prisma.game.findUniqueOrThrow({ where: { id: state.id } });
      expect(row).toMatchObject({
        status: 'ACTIVE',
        targetScore: 100,
        activePlayerId: player1.id,
        player1GlobalScore: 0,
        player2GlobalScore: 0,
        currentRoundScore: 0,
        lastDie1: null,
        lastDie2: null,
        lastOutcome: null,
        winnerId: null,
        version: 1,
      });
    });

    it('accepts an explicit target score when the other player creates the game', async () => {
      const player1 = await register();
      const player2 = await register();

      const { body } = await authed(player2.token, '/api/games', {
        player1Id: player1.id,
        player2Id: player2.id,
        targetScore: 10,
        isVsAi: false,
        cheat: true,
      }).expect(201);

      expect(GameStateSchema.parse(body)).toMatchObject({
        targetScore: 10,
        activePlayerId: player1.id,
      });
    });

    it('rejects a malformed body, a duplicated player, a spectator, and a missing player', async () => {
      const player1 = await register();
      const player2 = await register();
      const spectator = await register();

      const invalid = await authed(player1.token, '/api/games', { player1Id: player1.id, player2Id: player2.id }).expect(400);
      expect(invalid.body).toMatchObject({
        message: 'Validation failed',
        issues: expect.arrayContaining([expect.objectContaining({ path: 'isVsAi' })]),
      });

      const duplicate = await authed(player1.token, '/api/games', {
        player1Id: player1.id,
        player2Id: player1.id,
        isVsAi: false,
      }).expect(400);
      expect(duplicate.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'player2Id' })]));

      const forbidden = await authed(spectator.token, '/api/games', {
        player1Id: player1.id,
        player2Id: player2.id,
        isVsAi: false,
      }).expect(403);
      expect(forbidden.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You can only start a game you are playing in',
      });

      const missing = await authed(player1.token, '/api/games', {
        player1Id: player1.id,
        player2Id: 'missing-player',
        isVsAi: false,
      }).expect(404);
      expect(missing.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'One or both players do not exist',
      });
    });
  });

  describe('roll, hold, and reset', () => {
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
      player1 = await register();
      player2 = await register();
    });

    async function createGame(targetScore?: number): Promise<GameStateDto> {
      const response = await authed(player1.token, '/api/games', {
        player1Id: player1.id,
        player2Id: player2.id,
        isVsAi: false,
        ...(targetScore === undefined ? {} : { targetScore }),
      }).expect(201);
      return stateFrom(response);
    }

    it.each(['roll', 'hold', 'reset', 'ai-step'])('POST /api/games/:id/%s requires a bearer token', async (action) => {
      const { body } = await server().post(`/api/games/some-game/${action}`).expect(401);
      expect(body).toMatchObject({ message: 'Missing bearer token' });
    });

    it('answers 401 to /roll and /hold without a valid token, even one naming the active player, and never rolls', async () => {
      script([3, 4]);
      const game = await createGame();
      await authed(player1.token, `/api/games/${game.id}/roll`).expect(200);
      const jwt = app.get(JwtService);
      const activePlayer = { sub: player1.id, username: player1.username };
      const invalidTokens = [
        'not-a-jwt',
        await jwt.signAsync(activePlayer, { expiresIn: -1 }),
        await jwt.signAsync(activePlayer, { secret: 'an-attacker-chosen-secret-of-32-chars' }),
      ];

      for (const action of ['roll', 'hold']) {
        const path = `/api/games/${game.id}/${action}`;
        const missing = await server().post(path).expect(401);
        expect(missing.body).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Missing bearer token' });
        for (const token of invalidTokens) {
          const invalid = await authed(token, path).expect(401);
          expect(invalid.body).toEqual({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid or expired access token',
          });
        }
      }

      expect(dice.rollPair).toHaveBeenCalledTimes(1);
      expect(await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({
        activePlayerId: player1.id,
        currentRoundScore: 7,
        player1GlobalScore: 0,
        version: 2,
      });
    });

    it('rejects a hold before any points have been rolled', async () => {
      const game = await createGame();

      const { body } = await authed(player1.token, `/api/games/${game.id}/hold`).expect(400);
      expect(body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Cannot hold without points in the current round',
      });
    });

    it('keeps the turn with player 1 while standard rolls add up, then a double six wipes the round and passes it to player 2', async () => {
      script([2, 3], [4, 4], [6, 6]);
      const game = await createGame();
      const roll = (player: Player) => authed(player.token, `/api/games/${game.id}/roll`);
      const row = () => prisma.game.findUniqueOrThrow({ where: { id: game.id } });

      const first = stateFrom(await roll(player1).expect(200));
      const second = stateFrom(await roll(player1).expect(200));
      expect(first).toMatchObject({
        roundScore: 5,
        lastRoll: [2, 3],
        lastOutcome: 'STANDARD',
        activePlayerId: player1.id,
        canWinOnHold: false,
      });
      expect(second).toMatchObject({
        roundScore: 13,
        lastRoll: [4, 4],
        lastOutcome: 'STANDARD',
        activePlayerId: player1.id,
        canWinOnHold: false,
      });
      expect(await row()).toMatchObject({ activePlayerId: player1.id, currentRoundScore: 13, version: 3 });

      const bust = stateFrom(await roll(player1).expect(200));
      expect(bust).toMatchObject({
        status: 'ACTIVE',
        roundScore: 0,
        lastRoll: [6, 6],
        lastOutcome: 'DOUBLE_SIX',
        activePlayerId: player2.id,
        version: 4,
        players: { player1: { globalScore: 0 }, player2: { globalScore: 0 } },
      });
      expect(await row()).toMatchObject({
        activePlayerId: player2.id,
        currentRoundScore: 0,
        player1GlobalScore: 0,
        lastDie1: 6,
        lastDie2: 6,
        lastOutcome: 'DOUBLE_SIX',
        version: 4,
      });
      expect(dice.rollPair).toHaveBeenCalledTimes(3);

      await roll(player1).expect(403);
    });

    it("refuses player 2's /roll and /hold during player 1's turn with 403, without rolling or touching player 1's round", async () => {
      script([3, 4]);
      const game = await createGame();
      await authed(player1.token, `/api/games/${game.id}/roll`).expect(200);

      for (const action of ['roll', 'hold']) {
        const { body } = await authed(player2.token, `/api/games/${game.id}/${action}`).expect(403);
        expect(body).toEqual({ statusCode: 403, error: 'Forbidden', message: 'Not your turn' });
      }

      expect(dice.rollPair).toHaveBeenCalledTimes(1);
      expect(await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({
        activePlayerId: player1.id,
        currentRoundScore: 7,
        player1GlobalScore: 0,
        player2GlobalScore: 0,
        version: 2,
      });
      const banked = stateFrom(await authed(player1.token, `/api/games/${game.id}/hold`).expect(200));
      expect(banked).toMatchObject({
        activePlayerId: player2.id,
        players: { player1: { globalScore: 7 }, player2: { globalScore: 0 } },
      });
    });

    it('plays a bust, a banked turn, and a win, then seals the game and records both players', async () => {
      script([4, 5], [6, 6], [6, 5]);
      const game = await createGame(20);

      const rolled = stateFrom(await authed(player1.token, `/api/games/${game.id}/roll`).expect(200));
      expect(rolled).toMatchObject({
        roundScore: 9,
        lastRoll: [4, 5],
        lastOutcome: 'STANDARD',
        activePlayerId: player1.id,
        version: 2,
        canWinOnHold: false,
      });

      const banked = stateFrom(await authed(player1.token, `/api/games/${game.id}/hold`).expect(200));
      expect(banked).toMatchObject({
        roundScore: 0,
        lastRoll: [4, 5],
        lastOutcome: 'HOLD',
        activePlayerId: player2.id,
        version: 3,
        players: { player1: { globalScore: 9 }, player2: { globalScore: 0 } },
      });

      const outOfTurn = await authed(player1.token, `/api/games/${game.id}/roll`).expect(403);
      expect(outOfTurn.body).toEqual({ statusCode: 403, error: 'Forbidden', message: 'Not your turn' });

      const bust = stateFrom(await authed(player2.token, `/api/games/${game.id}/roll`).expect(200));
      expect(bust).toMatchObject({
        roundScore: 0,
        lastRoll: [6, 6],
        lastOutcome: 'DOUBLE_SIX',
        activePlayerId: player1.id,
        version: 4,
        players: { player1: { globalScore: 9 }, player2: { globalScore: 0 } },
      });

      const pushed = stateFrom(await authed(player1.token, `/api/games/${game.id}/roll`).expect(200));
      expect(pushed).toMatchObject({
        roundScore: 11,
        lastRoll: [6, 5],
        lastOutcome: 'STANDARD',
        version: 5,
        canWinOnHold: true,
      });

      const won = stateFrom(await authed(player1.token, `/api/games/${game.id}/hold`).expect(200));
      expect(won).toMatchObject({
        status: 'FINISHED',
        roundScore: 0,
        lastRoll: [6, 5],
        lastOutcome: 'WIN',
        activePlayerId: player1.id,
        winnerId: player1.id,
        version: 6,
        canWinOnHold: false,
        players: { player1: { globalScore: 20, wins: 1 }, player2: { globalScore: 0, wins: 0 } },
      });

      const [winner, loser, row] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: player1.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: player2.id } }),
        prisma.game.findUniqueOrThrow({ where: { id: game.id } }),
      ]);
      expect(winner).toMatchObject({ wins: 1, gamesPlayed: 1 });
      expect(loser).toMatchObject({ wins: 0, gamesPlayed: 1 });
      expect(row).toMatchObject({
        status: 'FINISHED',
        winnerId: player1.id,
        player1GlobalScore: 20,
        currentRoundScore: 0,
        lastDie1: 6,
        lastDie2: 5,
        lastOutcome: 'WIN',
        version: 6,
      });

      const sealed = await authed(player1.token, `/api/games/${game.id}/roll`).expect(409);
      expect(sealed.body).toEqual({ statusCode: 409, error: 'Conflict', message: 'Game is already finished' });
      await authed(player2.token, `/api/games/${game.id}/hold`).expect(409);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: player1.id } })).toMatchObject({
        wins: 1,
        gamesPlayed: 1,
      });

      const rematch = stateFrom(await authed(player2.token, `/api/games/${game.id}/reset`, { targetScore: 50 }).expect(201));
      expect(rematch).toMatchObject({
        status: 'ACTIVE',
        targetScore: 50,
        activePlayerId: player1.id,
        roundScore: 0,
        lastRoll: null,
        lastOutcome: null,
        winnerId: null,
        version: 1,
        players: {
          player1: { id: player1.id, globalScore: 0 },
          player2: { id: player2.id, globalScore: 0 },
        },
      });
      expect(rematch.id).not.toBe(game.id);
      expect(await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({
        status: 'FINISHED',
        winnerId: player1.id,
        version: 6,
      });

      const kept = stateFrom(await authed(player1.token, `/api/games/${rematch.id}/reset`, {}).expect(201));
      expect(kept.targetScore).toBe(50);
      expect(kept.id).not.toBe(rematch.id);
    });

    it("adds one to the winner's wins in the database for every game they win", async () => {
      script([5, 5], [6, 4]);

      async function winAsPlayer1(gameId: string): Promise<void> {
        await authed(player1.token, `/api/games/${gameId}/roll`).expect(200);
        const won = stateFrom(await authed(player1.token, `/api/games/${gameId}/hold`).expect(200));
        expect(won).toMatchObject({
          status: 'FINISHED',
          winnerId: player1.id,
          lastOutcome: 'WIN',
          players: { player1: { globalScore: 10 } },
        });
        expect(await prisma.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
          status: 'FINISHED',
          winnerId: player1.id,
        });
      }

      const first = await createGame(10);
      await winAsPlayer1(first.id);
      const rematch = stateFrom(await authed(player2.token, `/api/games/${first.id}/reset`, {}).expect(201));
      await winAsPlayer1(rematch.id);

      const [winner, loser] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: player1.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: player2.id } }),
      ]);
      expect(winner).toMatchObject({ wins: 2, gamesPlayed: 2 });
      expect(loser).toMatchObject({ wins: 0, gamesPlayed: 2 });
    });

    it('rejects a reset from someone who is not in the game, and an unknown game', async () => {
      const game = await createGame();
      const spectator = await register();

      const forbidden = await authed(spectator.token, `/api/games/${game.id}/reset`, {}).expect(403);
      expect(forbidden.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You can only reset a game you are playing in',
      });

      const missing = await authed(player1.token, '/api/games/missing-game/roll').expect(404);
      expect(missing.body).toEqual({ statusCode: 404, error: 'Not Found', message: 'Game not found' });

      const badTarget = await authed(player1.token, `/api/games/${game.id}/reset`, { targetScore: 9 }).expect(400);
      expect(badTarget.body).toMatchObject({
        message: 'Validation failed',
        issues: expect.arrayContaining([expect.objectContaining({ path: 'targetScore' })]),
      });
    });

    it('keeps the score equal to the rolls that actually committed when several arrive together', async () => {
      script([1, 1], [1, 1], [1, 1]);
      const game = await createGame();

      const responses = await Promise.all([
        authed(player1.token, `/api/games/${game.id}/roll`),
        authed(player1.token, `/api/games/${game.id}/roll`),
        authed(player1.token, `/api/games/${game.id}/roll`),
      ]);

      const applied = responses.filter((response) => response.status === 200).map((response) => stateFrom(response));
      const conflicts = responses.filter((response) => response.status === 409);
      expect(applied.length + conflicts.length).toBe(3);
      expect(applied.length).toBeGreaterThan(0);

      const latest = applied.reduce((best, state) => (state.version > best.version ? state : best));
      expect(latest).toMatchObject({
        roundScore: 2 * applied.length,
        version: 1 + applied.length,
        activePlayerId: player1.id,
        lastOutcome: 'STANDARD',
      });
      const row = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      expect(row).toMatchObject({ currentRoundScore: latest.roundScore, version: latest.version });
    });
  });

  describe('POST /api/games/:id/ai-step', () => {
    let human: Player;
    let aiId: string;

    beforeEach(async () => {
      human = await register();
      aiId = (await prisma.user.findUniqueOrThrow({ where: { username: AI_PLAYER_USERNAME } })).id;
    });

    async function createAiGame(aiSeat: 'player1' | 'player2'): Promise<GameStateDto> {
      const [player1Id, player2Id] = aiSeat === 'player1' ? [aiId, human.id] : [human.id, aiId];
      return stateFrom(await authed(human.token, '/api/games', { player1Id, player2Id, isVsAi: true }).expect(201));
    }

    async function aiStep(gameId: string): Promise<AiStepResponseDto> {
      const { body } = await authed(human.token, `/api/games/${gameId}/ai-step`).expect(200);
      return AiStepResponseSchema.parse(body);
    }

    it("lets the human opponent play the AI's turn one decision at a time", async () => {
      script([1, 1], [5, 6], [4, 6]);
      const game = await createAiGame('player2');
      await authed(human.token, `/api/games/${game.id}/roll`).expect(200);
      await authed(human.token, `/api/games/${game.id}/hold`).expect(200);

      const outOfTurn = await authed(human.token, `/api/games/${game.id}/roll`).expect(403);
      expect(outOfTurn.body).toMatchObject({ message: 'Not your turn' });

      const steps = [await aiStep(game.id), await aiStep(game.id), await aiStep(game.id)];
      expect(steps.map((step) => [step.aiDecision, step.roundScore, step.activePlayerId])).toEqual([
        ['ROLL', 11, aiId],
        ['ROLL', 21, aiId],
        ['HOLD', 0, human.id],
      ]);
      expect(steps[2]).toMatchObject({
        status: 'ACTIVE',
        lastRoll: [4, 6],
        lastOutcome: 'HOLD',
        version: 6,
        players: {
          player1: { id: human.id, globalScore: 2 },
          player2: { id: aiId, isAi: true, globalScore: 21 },
        },
      });
      expect(await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({
        activePlayerId: human.id,
        player2GlobalScore: 21,
        currentRoundScore: 0,
        version: 6,
      });

      const humanTurn = await authed(human.token, `/api/games/${game.id}/ai-step`).expect(403);
      expect(humanTurn.body).toEqual({ statusCode: 403, error: 'Forbidden', message: "Not the AI player's turn" });
    });

    it('refuses a spectator and an unknown game', async () => {
      const game = await createAiGame('player1');
      const spectator = await register();

      const forbidden = await authed(spectator.token, `/api/games/${game.id}/ai-step`).expect(403);
      expect(forbidden.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You can only advance the AI in a game you are playing in',
      });

      const missing = await authed(human.token, '/api/games/missing-game/ai-step').expect(404);
      expect(missing.body).toEqual({ statusCode: 404, error: 'Not Found', message: 'Game not found' });
      expect(await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({ version: 1 });
    });
  });

  it('documents the game routes in the shared OpenAPI schema', async () => {
    const { body } = await server().get('/api/docs-json').expect(200);

    expect(body.paths).toMatchObject({
      '/api/games': { post: expect.any(Object) },
      '/api/games/{id}/roll': { post: expect.any(Object) },
      '/api/games/{id}/hold': { post: expect.any(Object) },
      '/api/games/{id}/reset': { post: expect.any(Object) },
      '/api/games/{id}/ai-step': { post: expect.any(Object) },
    });
    expect(JSON.stringify(body.paths['/api/games'])).not.toContain('passwordHash');
    expect(JSON.stringify(body.paths['/api/games/{id}/ai-step'])).toContain('aiDecision');
  });
});
