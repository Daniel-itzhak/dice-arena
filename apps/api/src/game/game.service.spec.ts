import type { CreateGameDto, DiceRoll, GameStateDto } from '@dice-arena/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AiStrategyService } from './ai-strategy.service.js';
import type { DiceService } from './dice.service.js';
import { GameService } from './game.service.js';

interface StoredUser {
  id: string;
  username: string;
  isAi: boolean;
  wins: number;
  gamesPlayed: number;
}

interface StoredGame {
  id: string;
  status: 'ACTIVE' | 'FINISHED';
  targetScore: number;
  player1Id: string;
  player2Id: string;
  activePlayerId: string;
  player1GlobalScore: number;
  player2GlobalScore: number;
  currentRoundScore: number;
  lastDie1: number | null;
  lastDie2: number | null;
  lastOutcome: 'STANDARD' | 'DOUBLE_SIX' | 'HOLD' | 'WIN' | null;
  winnerId: string | null;
  version: number;
}

interface GamePatch {
  status?: StoredGame['status'];
  activePlayerId?: string;
  player1GlobalScore?: number;
  player2GlobalScore?: number;
  currentRoundScore?: number;
  lastDie1?: number;
  lastDie2?: number;
  lastOutcome?: Exclude<StoredGame['lastOutcome'], null>;
  winnerId?: string;
  version?: { increment: number };
}

interface GameWhere {
  id?: string;
  version?: number;
  status?: StoredGame['status'];
  activePlayerId?: string;
}

const alice: StoredUser = { id: 'p1', username: 'alice', isAi: false, wins: 0, gamesPlayed: 0 };
const bob: StoredUser = { id: 'p2', username: 'bob', isAi: false, wins: 0, gamesPlayed: 0 };
const robo: StoredUser = { id: 'ai', username: 'RoboRoller', isAi: true, wins: 0, gamesPlayed: 0 };

const WHERE_KEYS = new Set(['id', 'version', 'status', 'activePlayerId']);
const PATCH_KEYS = new Set([
  'status',
  'activePlayerId',
  'player1GlobalScore',
  'player2GlobalScore',
  'currentRoundScore',
  'lastDie1',
  'lastDie2',
  'lastOutcome',
  'winnerId',
  'version',
]);

/** In-memory stand-in for the Prisma calls GameService makes. Version checks are real. */
class MemoryDb {
  private readonly users = new Map<string, StoredUser>();
  private readonly games = new Map<string, StoredGame>();
  private sequence = 0;
  private holdReads = 0;
  private waitingReads = 0;
  private gate: Promise<void> = Promise.resolve();
  private releaseGate: (() => void) | undefined;

  readonly user = {
    findMany: async (args: { where?: { id?: { in?: string[] } } }): Promise<Array<{ id: string }>> => {
      const ids = new Set(args.where?.id?.in ?? []);
      return [...this.users.values()].filter((user) => ids.has(user.id)).map((user) => ({ id: user.id }));
    },
    update: async (args: {
      where: { id: string };
      data: { wins?: { increment: number }; gamesPlayed?: { increment: number } };
    }): Promise<StoredUser> => {
      const user = this.users.get(args.where.id);
      if (!user) {
        throw new Error(`missing user ${args.where.id}`);
      }
      if (args.data.wins) {
        user.wins += args.data.wins.increment;
      }
      if (args.data.gamesPlayed) {
        user.gamesPlayed += args.data.gamesPlayed.increment;
      }
      return user;
    },
  };

  readonly game = {
    findUnique: async (args: { where: { id: string } }): Promise<StoredGame & { player1: StoredUser; player2: StoredUser } | null> => {
      const row = this.games.get(args.where.id);
      if (!row) {
        return null;
      }
      const snapshot = structuredClone(row);
      await this.maybeHold();
      return this.toLoaded(snapshot);
    },
    updateMany: async (args: { where: GameWhere; data: GamePatch }): Promise<{ count: number }> => {
      for (const key of Object.keys(args.where)) {
        if (!WHERE_KEYS.has(key)) {
          throw new Error(`unexpected where.${key}`);
        }
      }
      for (const key of Object.keys(args.data)) {
        if (!PATCH_KEYS.has(key)) {
          throw new Error(`unexpected data.${key}`);
        }
      }
      const game = args.where.id === undefined ? undefined : this.games.get(args.where.id);
      if (
        !game ||
        (args.where.version !== undefined && game.version !== args.where.version) ||
        (args.where.status !== undefined && game.status !== args.where.status) ||
        (args.where.activePlayerId !== undefined && game.activePlayerId !== args.where.activePlayerId)
      ) {
        return { count: 0 };
      }
      this.applyPatch(game, args.data);
      return { count: 1 };
    },
    create: async (args: { data: Omit<StoredGame, 'id' | 'lastDie1' | 'lastDie2' | 'lastOutcome' | 'winnerId'> & Partial<StoredGame> }): Promise<StoredGame & { player1: StoredUser; player2: StoredUser }> => {
      const id = `game-${++this.sequence}`;
      const row: StoredGame = {
        id,
        status: args.data.status ?? 'ACTIVE',
        targetScore: args.data.targetScore,
        player1Id: args.data.player1Id,
        player2Id: args.data.player2Id,
        activePlayerId: args.data.activePlayerId,
        player1GlobalScore: args.data.player1GlobalScore ?? 0,
        player2GlobalScore: args.data.player2GlobalScore ?? 0,
        currentRoundScore: args.data.currentRoundScore ?? 0,
        lastDie1: args.data.lastDie1 ?? null,
        lastDie2: args.data.lastDie2 ?? null,
        lastOutcome: args.data.lastOutcome ?? null,
        winnerId: args.data.winnerId ?? null,
        version: args.data.version ?? 1,
      };
      this.games.set(id, row);
      return this.toLoaded(row);
    },
  };

  /** The next `count` reads return the pre-update snapshot and wait until all of them have started. */
  $transaction = async <T>(callback: (tx: MemoryDb) => Promise<T>): Promise<T> => callback(this);

  constructor(users: readonly StoredUser[]) {
    for (const user of users) {
      this.users.set(user.id, { ...user });
    }
  }

  asPrisma(): PrismaService {
    return this as unknown as PrismaService;
  }

  holdNextReads(count: number): void {
    this.waitingReads = 0;
    this.holdReads = count;
    this.gate = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
  }

  storedGame(id: string): StoredGame {
    const game = this.games.get(id);
    if (!game) {
      throw new Error(`missing game ${id}`);
    }
    return game;
  }

  stats(id: string): Pick<StoredUser, 'wins' | 'gamesPlayed'> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`missing user ${id}`);
    }
    return { wins: user.wins, gamesPlayed: user.gamesPlayed };
  }

  private async maybeHold(): Promise<void> {
    if (this.holdReads === 0) {
      return;
    }
    this.waitingReads += 1;
    const gate = this.gate;
    if (this.waitingReads === this.holdReads) {
      this.holdReads = 0;
      this.releaseGate?.();
    }
    await gate;
  }

  private toLoaded(row: StoredGame): StoredGame & { player1: StoredUser; player2: StoredUser } {
    return { ...row, player1: this.player(row.player1Id), player2: this.player(row.player2Id) };
  }

  private player(id: string): StoredUser {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`missing user ${id}`);
    }
    return { id: user.id, username: user.username, isAi: user.isAi, wins: user.wins, gamesPlayed: user.gamesPlayed };
  }

  private applyPatch(game: StoredGame, data: GamePatch): void {
    if (data.version?.increment === undefined) {
      throw new Error('game update must increment version');
    }
    if (data.status !== undefined) {
      game.status = data.status;
    }
    if (data.activePlayerId !== undefined) {
      game.activePlayerId = data.activePlayerId;
    }
    if (data.player1GlobalScore !== undefined) {
      game.player1GlobalScore = data.player1GlobalScore;
    }
    if (data.player2GlobalScore !== undefined) {
      game.player2GlobalScore = data.player2GlobalScore;
    }
    if (data.currentRoundScore !== undefined) {
      game.currentRoundScore = data.currentRoundScore;
    }
    if (data.lastDie1 !== undefined) {
      game.lastDie1 = data.lastDie1;
    }
    if (data.lastDie2 !== undefined) {
      game.lastDie2 = data.lastDie2;
    }
    if (data.lastOutcome !== undefined) {
      game.lastOutcome = data.lastOutcome;
    }
    if (data.winnerId !== undefined) {
      game.winnerId = data.winnerId;
    }
    game.version += data.version.increment;
  }
}

function scriptedDice(rolls: readonly (readonly [number, number])[]): DiceService {
  const queue: DiceRoll[] = rolls.map(([die1, die2]) => [die1, die2]);
  return {
    rollPair: () => {
      const roll = queue.shift();
      if (roll === undefined) {
        throw new Error('unexpected roll');
      }
      return roll;
    },
  } as unknown as DiceService;
}

function request(targetScore = 100): CreateGameDto {
  return { player1Id: alice.id, player2Id: bob.id, targetScore, isVsAi: false };
}

function vsAi(targetScore = 100, aiSeat: 'player1' | 'player2' = 'player2'): CreateGameDto {
  const [player1Id, player2Id] = aiSeat === 'player1' ? [robo.id, alice.id] : [alice.id, robo.id];
  return { player1Id, player2Id, targetScore, isVsAi: true };
}

function serviceWith(
  rolls: readonly (readonly [number, number])[],
  store = new MemoryDb([alice, bob, robo]),
): { service: GameService; store: MemoryDb } {
  return { service: new GameService(store.asPrisma(), scriptedDice(rolls), new AiStrategyService()), store };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to fail');
}

describe('GameService', () => {
  let store: MemoryDb;
  let service: GameService;

  beforeEach(() => {
    ({ service, store } = serviceWith([]));
  });

  describe('create', () => {
    it('starts an active game at zero with player 1 to move', async () => {
      const game = await service.create(alice.id, request(40));

      expect(game).toMatchObject({
        status: 'ACTIVE',
        targetScore: 40,
        activePlayerId: alice.id,
        roundScore: 0,
        lastRoll: null,
        lastOutcome: null,
        winnerId: null,
        version: 1,
        players: {
          player1: { id: alice.id, username: 'alice', isAi: false, globalScore: 0 },
          player2: { id: bob.id, username: 'bob', isAi: false, globalScore: 0 },
        },
      });
      expect(store.stats(alice.id)).toEqual({ wins: 0, gamesPlayed: 0 });
    });

    it('lets either participant start, and rejects everyone else before looking players up', async () => {
      await expect(service.create(bob.id, request())).resolves.toMatchObject({ activePlayerId: alice.id });

      const error = await rejection(service.create('outsider', request()));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error).toMatchObject({ message: 'You can only start a game you are playing in' });
    });

    it('rejects a missing player and a game against yourself', async () => {
      const missing = await rejection(service.create(alice.id, { ...request(), player2Id: 'missing' }));
      expect(missing).toBeInstanceOf(NotFoundException);

      const same = await rejection(service.create(alice.id, { ...request(), player2Id: alice.id }));
      expect(same).toBeInstanceOf(BadRequestException);
      expect(same).toMatchObject({ message: 'player1Id and player2Id must be different users' });
    });
  });

  describe('roll', () => {
    let game: GameStateDto;

    beforeEach(async () => {
      ({ service, store } = serviceWith([
        [1, 2],
        [3, 4],
      ]));
      game = await service.create(alice.id, request());
    });

    it('adds the dice to the round and leaves the turn where it is', async () => {
      const first = await service.roll(game.id, alice.id);
      const second = await service.roll(game.id, alice.id);

      expect(first).toMatchObject({
        roundScore: 3,
        lastRoll: [1, 2],
        lastOutcome: 'STANDARD',
        activePlayerId: alice.id,
        version: 2,
        players: { player1: { globalScore: 0 }, player2: { globalScore: 0 } },
      });
      expect(second).toMatchObject({ roundScore: 10, lastRoll: [3, 4], lastOutcome: 'STANDARD', version: 3 });
    });

    it('clears the round and switches turns on double six', async () => {
      ({ service, store } = serviceWith([
        [5, 1],
        [6, 6],
      ]));
      game = await service.create(alice.id, request());
      await service.roll(game.id, alice.id);

      const bust = await service.roll(game.id, alice.id);

      expect(bust).toMatchObject({
        roundScore: 0,
        lastRoll: [6, 6],
        lastOutcome: 'DOUBLE_SIX',
        activePlayerId: bob.id,
        version: 3,
        players: { player1: { globalScore: 0 }, player2: { globalScore: 0 } },
      });
      expect(store.stats(alice.id)).toEqual({ wins: 0, gamesPlayed: 0 });
      expect(await rejection(service.roll(game.id, alice.id))).toBeInstanceOf(ForbiddenException);
    });

    it('refuses another player, a finished game, and an unknown game without rolling', async () => {
      expect(await rejection(service.roll(game.id, bob.id))).toMatchObject({ message: 'Not your turn' });
      expect(store.storedGame(game.id).version).toBe(1);

      store.storedGame(game.id).status = 'FINISHED';
      expect(await rejection(service.roll(game.id, alice.id))).toMatchObject({ message: 'Game is already finished' });
      expect(await rejection(service.roll('missing', alice.id))).toBeInstanceOf(NotFoundException);
      expect(store.storedGame(game.id)).toMatchObject({ version: 1, currentRoundScore: 0, lastDie1: null });
    });
  });

  describe('hold', () => {
    it('rejects an empty round', async () => {
      const game = await service.create(alice.id, request());

      const error = await rejection(service.hold(game.id, alice.id));
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toMatchObject({ message: 'Cannot hold without points in the current round' });
      expect(store.storedGame(game.id).version).toBe(1);
    });

    it('banks the round, keeps the last roll, and passes the turn when the target is still ahead', async () => {
      ({ service, store } = serviceWith([[4, 5]]));
      const game = await service.create(alice.id, request(20));
      await service.roll(game.id, alice.id);

      const held = await service.hold(game.id, alice.id);

      expect(held).toMatchObject({
        status: 'ACTIVE',
        roundScore: 0,
        lastRoll: [4, 5],
        lastOutcome: 'HOLD',
        activePlayerId: bob.id,
        winnerId: null,
        version: 3,
        players: { player1: { globalScore: 9 }, player2: { globalScore: 0 } },
      });
      expect(store.stats(alice.id)).toEqual({ wins: 0, gamesPlayed: 0 });
      expect(await rejection(service.hold(game.id, bob.id))).toBeInstanceOf(BadRequestException);
    });

    it.each([
      [10, [4, 6], 10],
      [10, [6, 5], 11],
    ] as const)('wins at target %i with a bank of %j (score %i) and records both players once', async (target, roll, score) => {
      ({ service, store } = serviceWith([roll]));
      const game = await service.create(alice.id, request(target));
      await service.roll(game.id, alice.id);

      const won = await service.hold(game.id, alice.id);

      expect(won).toMatchObject({
        status: 'FINISHED',
        roundScore: 0,
        lastRoll: [...roll],
        lastOutcome: 'WIN',
        activePlayerId: alice.id,
        winnerId: alice.id,
        version: 3,
        players: { player1: { globalScore: score }, player2: { globalScore: 0 } },
      });
      expect(store.stats(alice.id)).toEqual({ wins: 1, gamesPlayed: 1 });
      expect(store.stats(bob.id)).toEqual({ wins: 0, gamesPlayed: 1 });
      expect(await rejection(service.hold(game.id, alice.id))).toMatchObject({ message: 'Game is already finished' });
      expect(store.stats(alice.id)).toEqual({ wins: 1, gamesPlayed: 1 });
    });

    it('banks player 2 onto their own score when they are the one to reach the target', async () => {
      ({ service, store } = serviceWith([
        [1, 1],
        [6, 5],
      ]));
      const game = await service.create(alice.id, request(10));
      await service.roll(game.id, alice.id);
      await service.hold(game.id, alice.id);
      await service.roll(game.id, bob.id);

      const won = await service.hold(game.id, bob.id);

      expect(won).toMatchObject({
        status: 'FINISHED',
        winnerId: bob.id,
        activePlayerId: bob.id,
        lastOutcome: 'WIN',
        players: { player1: { globalScore: 2 }, player2: { globalScore: 11 } },
      });
      expect(store.stats(bob.id)).toEqual({ wins: 1, gamesPlayed: 1 });
      expect(store.stats(alice.id)).toEqual({ wins: 0, gamesPlayed: 1 });
    });
  });

  describe('aiStep', () => {
    it('plays one roll per call, banks once the round reaches 21, and hands the turn back', async () => {
      ({ service, store } = serviceWith([
        [1, 1],
        [5, 6],
        [4, 6],
      ]));
      const game = await service.create(alice.id, vsAi());
      await service.roll(game.id, alice.id);
      await service.hold(game.id, alice.id);

      const first = await service.aiStep(game.id, alice.id);
      const second = await service.aiStep(game.id, alice.id);
      const banked = await service.aiStep(game.id, alice.id);

      expect(first).toMatchObject({
        aiDecision: 'ROLL',
        roundScore: 11,
        lastRoll: [5, 6],
        lastOutcome: 'STANDARD',
        activePlayerId: robo.id,
        version: 4,
      });
      expect(second).toMatchObject({ aiDecision: 'ROLL', roundScore: 21, lastRoll: [4, 6], version: 5 });
      expect(banked).toMatchObject({
        aiDecision: 'HOLD',
        status: 'ACTIVE',
        roundScore: 0,
        lastRoll: [4, 6],
        lastOutcome: 'HOLD',
        activePlayerId: alice.id,
        version: 6,
        players: { player1: { globalScore: 2 }, player2: { id: robo.id, isAi: true, globalScore: 21 } },
      });

      const handedBack = await rejection(service.aiStep(game.id, alice.id));
      expect(handedBack).toBeInstanceOf(ForbiddenException);
      expect(handedBack).toMatchObject({ message: "Not the AI player's turn" });
      expect(store.storedGame(game.id).version).toBe(6);
    });

    it('passes the turn to the human when the AI rolls a double six', async () => {
      ({ service, store } = serviceWith([[6, 6]]));
      const game = await service.create(alice.id, vsAi(100, 'player1'));

      const bust = await service.aiStep(game.id, alice.id);

      expect(bust).toMatchObject({
        aiDecision: 'ROLL',
        roundScore: 0,
        lastRoll: [6, 6],
        lastOutcome: 'DOUBLE_SIX',
        activePlayerId: alice.id,
        version: 2,
        players: { player1: { globalScore: 0 }, player2: { globalScore: 0 } },
      });
    });

    it('holds to win as soon as the round reaches the target, and records both players', async () => {
      ({ service, store } = serviceWith([[5, 5]]));
      const game = await service.create(alice.id, vsAi(10, 'player1'));
      await service.aiStep(game.id, alice.id);

      const won = await service.aiStep(game.id, alice.id);

      expect(won).toMatchObject({
        aiDecision: 'HOLD',
        status: 'FINISHED',
        roundScore: 0,
        lastOutcome: 'WIN',
        activePlayerId: robo.id,
        winnerId: robo.id,
        players: { player1: { globalScore: 10 }, player2: { globalScore: 0 } },
      });
      expect(store.stats(robo.id)).toEqual({ wins: 1, gamesPlayed: 1 });
      expect(store.stats(alice.id)).toEqual({ wins: 0, gamesPlayed: 1 });
      expect(await rejection(service.aiStep(game.id, alice.id))).toMatchObject({ message: 'Game is already finished' });
    });

    it("weighs the AI's own score and the human's score from the right seats", async () => {
      ({ service, store } = serviceWith([[1, 1]]));
      const game = await service.create(alice.id, vsAi(100, 'player1'));
      Object.assign(store.storedGame(game.id), { player2GlobalScore: 85, currentRoundScore: 25 });

      const pressured = await service.aiStep(game.id, alice.id);
      expect(pressured).toMatchObject({ aiDecision: 'ROLL', roundScore: 27, activePlayerId: robo.id });

      store.storedGame(game.id).player2GlobalScore = 60;
      const relaxed = await service.aiStep(game.id, alice.id);
      expect(relaxed).toMatchObject({
        aiDecision: 'HOLD',
        activePlayerId: alice.id,
        players: { player1: { globalScore: 27 }, player2: { globalScore: 60 } },
      });
    });

    it('refuses a stranger, a human turn, a finished game, and an unknown game without rolling', async () => {
      const aiToMove = await service.create(alice.id, vsAi(100, 'player1'));
      const humanToMove = await service.create(alice.id, vsAi());
      const noAi = await service.create(alice.id, request());

      const stranger = await rejection(service.aiStep(aiToMove.id, bob.id));
      expect(stranger).toBeInstanceOf(ForbiddenException);
      expect(stranger).toMatchObject({ message: 'You can only advance the AI in a game you are playing in' });
      expect(await rejection(service.roll(aiToMove.id, alice.id))).toMatchObject({ message: 'Not your turn' });
      expect(await rejection(service.aiStep(humanToMove.id, alice.id))).toMatchObject({
        message: "Not the AI player's turn",
      });
      expect(await rejection(service.aiStep(noAi.id, alice.id))).toMatchObject({ message: "Not the AI player's turn" });

      store.storedGame(aiToMove.id).status = 'FINISHED';
      const finished = await rejection(service.aiStep(aiToMove.id, alice.id));
      expect(finished).toBeInstanceOf(ConflictException);
      expect(finished).toMatchObject({ message: 'Game is already finished' });
      expect(await rejection(service.aiStep('missing', alice.id))).toBeInstanceOf(NotFoundException);

      for (const game of [aiToMove, humanToMove, noAi]) {
        expect(store.storedGame(game.id)).toMatchObject({ version: 1, currentRoundScore: 0, lastDie1: null });
      }
    });
  });

  describe('reset', () => {
    it('opens a fresh rematch for either player and can change the target score', async () => {
      ({ service, store } = serviceWith([[2, 2]]));
      const original = await service.create(alice.id, request(80));
      await service.roll(original.id, alice.id);

      const sameTarget = await service.reset(original.id, bob.id);
      const nextTarget = await service.reset(original.id, alice.id, 25);

      expect(sameTarget).toMatchObject({
        id: expect.not.stringMatching(original.id),
        status: 'ACTIVE',
        targetScore: 80,
        activePlayerId: alice.id,
        roundScore: 0,
        lastRoll: null,
        lastOutcome: null,
        winnerId: null,
        version: 1,
        players: { player1: { id: alice.id, globalScore: 0 }, player2: { id: bob.id, globalScore: 0 } },
      });
      expect(nextTarget.targetScore).toBe(25);
      expect(store.storedGame(original.id)).toMatchObject({
        status: 'ACTIVE',
        currentRoundScore: 4,
        version: 2,
        targetScore: 80,
      });
    });

    it('rejects a spectator and an unknown game', async () => {
      const game = await service.create(alice.id, request());

      expect(await rejection(service.reset(game.id, 'outsider'))).toMatchObject({
        message: 'You can only reset a game you are playing in',
      });
      expect(await rejection(service.reset('missing', alice.id))).toBeInstanceOf(NotFoundException);
    });
  });

  describe('concurrency', () => {
    it('applies only the roll that still matches the version it read', async () => {
      ({ service, store } = serviceWith([
        [3, 3],
        [3, 3],
      ]));
      const game = await service.create(alice.id, request());
      store.holdNextReads(2);

      const settled = await withTimeout(
        Promise.allSettled([service.roll(game.id, alice.id), service.roll(game.id, alice.id)]),
      );
      const applied = settled.filter((result) => result.status === 'fulfilled');
      const conflicted = settled.filter((result) => result.status === 'rejected');

      expect(applied).toHaveLength(1);
      expect(conflicted).toHaveLength(1);
      const winner = applied[0];
      const loser = conflicted[0];
      if (winner === undefined || loser === undefined) {
        throw new Error('expected one applied roll and one conflict');
      }
      expect(winner.value).toMatchObject({ roundScore: 6, version: 2, lastRoll: [3, 3] });
      expect(loser.reason).toBeInstanceOf(ConflictException);
      expect(loser.reason).toMatchObject({ message: 'The game changed before this action could be applied' });
      expect(store.storedGame(game.id)).toMatchObject({ currentRoundScore: 6, version: 2 });
    });

    it('applies only one of two AI steps that arrive together', async () => {
      ({ service, store } = serviceWith([
        [2, 3],
        [2, 3],
      ]));
      const game = await service.create(alice.id, vsAi(100, 'player1'));
      store.holdNextReads(2);

      const settled = await withTimeout(
        Promise.allSettled([service.aiStep(game.id, alice.id), service.aiStep(game.id, alice.id)]),
      );

      const applied = settled.filter((result) => result.status === 'fulfilled');
      const conflicted = settled.filter((result) => result.status === 'rejected');
      expect(applied).toHaveLength(1);
      expect(conflicted).toHaveLength(1);
      expect(applied[0]?.value).toMatchObject({ aiDecision: 'ROLL', roundScore: 5, version: 2 });
      expect(conflicted[0]?.reason).toBeInstanceOf(ConflictException);
      expect(store.storedGame(game.id)).toMatchObject({ currentRoundScore: 5, version: 2 });
    });

    it('maps a database write conflict to the same 409', async () => {
      const game = await service.create(alice.id, request());
      store.$transaction = () =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: 'test' }),
        );

      const error = await rejection(service.roll(game.id, alice.id));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toMatchObject({ message: 'The game changed before this action could be applied' });
    });
  });
});

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out waiting for concurrent rolls')), 1000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
