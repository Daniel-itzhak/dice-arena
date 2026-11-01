import {
  AiStepResponseSchema,
  AuthResponseSchema,
  GameStateSchema,
  LeaderboardSchema,
  UserSchema,
  type AiStepResponseDto,
  type AuthCredentialsDto,
  type CreateGameInput,
  type GameStateDto,
  type LeaderboardDto,
  type ResetGameInput,
  type UserDto,
} from '@dice-arena/shared';
import type { z } from 'zod';
import { env } from '../config/env';
import { ApiError, ContractError, NetworkError, SessionError } from '../errors';
import { useArenaStore, type SlotId } from '../store/useArenaStore';

interface RequestOptions<TSchema extends z.ZodType> {
  path: string;
  schema: TSchema;
  method?: 'GET' | 'POST';
  token?: string;
  body?: object;
}

/**
 * Sends one request and validates the response against its shared schema.
 * @throws NetworkError when no HTTP response arrives.
 * @throws ApiError when the API answers with a non-2xx status.
 * @throws ContractError when a 2xx body does not match `schema`.
 */
async function request<TSchema extends z.ZodType>({
  path,
  schema,
  method = 'POST',
  token,
  body,
}: RequestOptions<TSchema>): Promise<z.output<TSchema>> {
  const headers = new Headers({ Accept: 'application/json' });
  if (token !== undefined) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    });
    text = await response.text();
  } catch (cause) {
    throw new NetworkError(cause);
  }

  const payload = parseJson(text);
  if (!response.ok) {
    throw ApiError.fromResponse(response.status, payload);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractError(`${method} ${path}`, parsed.error);
  }
  return parsed.data;
}

function parseJson(text: string): unknown {
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function slotToken(slot: SlotId): string {
  const { token } = useArenaStore.getState()[slot];
  if (token === null) {
    throw new SessionError(`${slot === 'slot1' ? 'Player 1' : 'Player 2'} is not signed in`);
  }
  return token;
}

/** The token of whichever slot is signed in as `game.activePlayerId`. */
function activePlayerToken(game: GameStateDto): string {
  const { slot1, slot2 } = useArenaStore.getState();
  const slot = [slot1, slot2].find(({ user }) => user?.id === game.activePlayerId);
  if (slot === undefined || slot.token === null) {
    throw new SessionError('The player whose turn it is is not signed in on this device');
  }
  return slot.token;
}

function currentGame(): GameStateDto {
  const { game } = useArenaStore.getState();
  if (game === null) {
    throw new SessionError('There is no game in progress');
  }
  return game;
}

/**
 * Stores the server's state verbatim, unless the store has moved on to a different game while the
 * request was in flight (for example, a reset that raced an AI step).
 */
function commitGame(requestedGameId: string, next: GameStateDto): void {
  const { game, setGame } = useArenaStore.getState();
  if (game?.id === requestedGameId) {
    setGame(next);
  }
}

function gamePath(gameId: string, action: 'roll' | 'hold' | 'ai-step' | 'reset'): string {
  return `/games/${encodeURIComponent(gameId)}/${action}`;
}

async function playTurn(action: 'roll' | 'hold'): Promise<GameStateDto> {
  const game = currentGame();
  const next = await request({
    path: gamePath(game.id, action),
    schema: GameStateSchema,
    token: activePlayerToken(game),
  });
  commitGame(game.id, next);
  return next;
}

async function startSession(slot: SlotId, path: string, credentials: AuthCredentialsDto): Promise<UserDto> {
  const session = await request({ path, schema: AuthResponseSchema, body: credentials });
  useArenaStore.getState().setSession(slot, session);
  return session.user;
}

export const authApi = {
  /** @throws SessionError when the other slot is already signed in as this user. */
  login(slot: SlotId, credentials: AuthCredentialsDto): Promise<UserDto> {
    return startSession(slot, '/auth/login', credentials);
  },

  /** @throws SessionError when the other slot is already signed in as this user. */
  register(slot: SlotId, credentials: AuthCredentialsDto): Promise<UserDto> {
    return startSession(slot, '/auth/register', credentials);
  },
};

export const gameApi = {
  /** Starts a game between slot1 (moves first) and slot2, which may be the AI player. */
  async create(targetScore?: number): Promise<GameStateDto> {
    const { slot1, slot2 } = useArenaStore.getState();
    if (slot1.user === null) {
      throw new SessionError('Player 1 is not signed in');
    }
    if (slot2.user === null) {
      throw new SessionError('Choose an opponent before starting a game');
    }
    const body: CreateGameInput = {
      player1Id: slot1.user.id,
      player2Id: slot2.user.id,
      isVsAi: slot2.isAiMode,
      targetScore,
    };
    const game = await request({ path: '/games', schema: GameStateSchema, token: slotToken('slot1'), body });
    useArenaStore.getState().setGame(game);
    return game;
  },

  /** Rolls for the active player, authenticated as whichever slot holds `game.activePlayerId`. */
  roll(): Promise<GameStateDto> {
    return playTurn('roll');
  },

  /** Banks the round for the active player, authenticated as whichever slot holds `game.activePlayerId`. */
  hold(): Promise<GameStateDto> {
    return playTurn('hold');
  },

  /** Plays one AI action. The AI cannot sign in, so its human opponent in slot1 authorizes the step. */
  async aiStep(): Promise<AiStepResponseDto> {
    const game = currentGame();
    const step = await request({
      path: gamePath(game.id, 'ai-step'),
      schema: AiStepResponseSchema,
      token: slotToken('slot1'),
    });
    const { aiDecision, ...state } = step;
    commitGame(game.id, state);
    return step;
  },

  /** Replaces the current game with a fresh one between the same players. Omit `targetScore` to keep it. */
  async reset(input: ResetGameInput = {}): Promise<GameStateDto> {
    const game = currentGame();
    const next = await request({
      path: gamePath(game.id, 'reset'),
      schema: GameStateSchema,
      token: slotToken('slot1'),
      body: input,
    });
    commitGame(game.id, next);
    return next;
  },
};

export const usersApi = {
  leaderboard(): Promise<LeaderboardDto> {
    return request({ method: 'GET', path: '/users/leaderboard', schema: LeaderboardSchema });
  },

  /** The built-in AI opponent, to be placed in slot2 with `selectAiOpponent`. */
  aiPlayer(): Promise<UserDto> {
    return request({ method: 'GET', path: '/users/ai', schema: UserSchema });
  },
};
