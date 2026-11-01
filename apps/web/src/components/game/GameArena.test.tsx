import type { AiDecision, AiStepResponseDto, GameStateDto } from '@dice-arena/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playDiceRoll, playDoubleSix, playHold, playWin } from '../../audio/soundEngine';
import { env } from '../../config/env';
import { useArenaStore } from '../../store/useArenaStore';
import { alice, bob, gameState, robo, seat } from '../../test/fixtures';
import { fetchMock, jsonResponse, respondWith, sentRequest } from '../../test/http';
import { AI_STEP_DELAY_MS, GameArena, PENALTY_LOCKOUT_MS } from './GameArena';

vi.mock('../../audio/soundEngine', () => ({
  playDiceRoll: vi.fn(),
  playHold: vi.fn(),
  playDoubleSix: vi.fn(),
  playWin: vi.fn(),
}));

const PENALTY_BANNER = 'Snake Eyes 6 & 6! Round score wiped — Turn passed!';

/** How many times each cue has played, for one-line assertions on the whole set. */
function soundsPlayed(): { dice: number; hold: number; doubleSix: number; win: number } {
  return {
    dice: vi.mocked(playDiceRoll).mock.calls.length,
    hold: vi.mocked(playHold).mock.calls.length,
    doubleSix: vi.mocked(playDoubleSix).mock.calls.length,
    win: vi.mocked(playWin).mock.calls.length,
  };
}

/** Renders the arena for whatever game is in the store, the way `App` does. */
function StoreBackedArena() {
  const game = useArenaStore((state) => state.game);
  return game === null ? null : <GameArena game={game} />;
}

function renderArena(): void {
  render(<StoreBackedArena />);
}

function startHumanMatch(game: GameStateDto = gameState()): void {
  const { setSession, setGame } = useArenaStore.getState();
  setSession('slot1', { user: alice, accessToken: 'alice-token' });
  setSession('slot2', { user: bob, accessToken: 'bob-token' });
  setGame(game);
}

function vsAiGame(overrides: Partial<GameStateDto> = {}): GameStateDto {
  return gameState({ players: { player1: seat(alice), player2: seat(robo) }, ...overrides });
}

function aiStep(aiDecision: AiDecision, overrides: Partial<GameStateDto>): AiStepResponseDto {
  return { ...vsAiGame(overrides), aiDecision };
}

function startAiMatch(overrides: Partial<GameStateDto> = {}): void {
  const { setSession, selectAiOpponent, setGame } = useArenaStore.getState();
  setSession('slot1', { user: alice, accessToken: 'alice-token' });
  selectAiOpponent(robo);
  setGame(vsAiGame(overrides));
}

/** Fires timers due within `ms` and lets the resulting fetches and renders settle. */
async function advance(ms = 0): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  await act(() => vi.advanceTimersByTimeAsync(0));
}

function card(username: string) {
  return within(screen.getByRole('region', { name: username }));
}

function roundScoreOf(username: string): string | null | undefined {
  return card(username).getByText('Current round').nextElementSibling?.textContent;
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name });
}

// Synchronous fireEvent rather than user-event: Testing Library's async wrapper waits on a real
// setTimeout(0) that only Jest's fake timers know to advance, so user-event hangs under Vitest's.
function click(name: string): void {
  fireEvent.click(button(name));
}

function turnRequest(gameId: string, action: string, token: string) {
  return { url: `${env.apiBaseUrl}/games/${gameId}/${action}`, method: 'POST', authorization: `Bearer ${token}`, body: undefined };
}

function isLocked(): boolean {
  return useArenaStore.getState().isActionLocked;
}

describe('GameArena', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    useArenaStore.setState(useArenaStore.getInitialState(), true);
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(playDiceRoll).mockClear();
    vi.mocked(playHold).mockClear();
    vi.mocked(playDoubleSix).mockClear();
    vi.mocked(playWin).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('player cards', () => {
    it('show career wins, global score progress, the round score, and whose turn it is', () => {
      startHumanMatch(
        gameState({
          targetScore: 50,
          roundScore: 9,
          lastRoll: [4, 5],
          lastOutcome: 'STANDARD',
          players: { player1: seat(alice, 20), player2: seat(bob, 35) },
        }),
      );
      renderArena();

      expect(card('alice').getByText('2 career wins')).toBeDefined();
      expect(card('bob').getByText('0 career wins')).toBeDefined();
      const progress = screen.getByRole('progressbar', { name: 'bob global score' });
      expect(progress.getAttribute('aria-valuenow')).toBe('35');
      expect(progress.getAttribute('aria-valuemax')).toBe('50');
      expect(roundScoreOf('alice')).toBe('9');
      expect(roundScoreOf('bob')).toBe('0');
      expect(card('alice').getByText('Active Turn')).toBeDefined();
      expect(card('bob').queryByText('Active Turn')).toBeNull();
      expect(screen.getByRole('region', { name: 'alice' }).getAttribute('aria-current')).toBe('true');
      expect(screen.getByRole('heading', { name: 'alice’s turn' })).toBeDefined();
      expect(screen.getByRole('img', { name: 'Last roll: 4 and 5' })).toBeDefined();
    });

    it('name the winner and drop the turn indicator once the game is finished', () => {
      startHumanMatch(
        gameState({
          status: 'FINISHED',
          winnerId: alice.id,
          lastRoll: [6, 5],
          lastOutcome: 'WIN',
          players: { player1: { ...seat(alice, 104), wins: 3 }, player2: seat(bob, 60) },
        }),
      );
      renderArena();

      expect(screen.getByRole('heading', { name: 'alice wins the match!' })).toBeDefined();
      expect(card('alice').getByText('Winner')).toBeDefined();
      expect(card('alice').getByText('3 career wins')).toBeDefined();
      expect(screen.queryByText('Active Turn')).toBeNull();
      expect(button('Roll Dice').disabled).toBe(true);
      expect(button('Hold').disabled).toBe(true);
      expect(button('New Game').disabled).toBe(false);
    });
  });

  describe('Roll and Hold', () => {
    it("rolls with the active player's token and stays locked until the server answers", async () => {
      startHumanMatch(gameState({ activePlayerId: bob.id }));
      renderArena();
      let answer: (response: Response) => void = () => undefined;
      fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

      click('Roll Dice');

      expect(sentRequest()).toEqual(turnRequest('game-1', 'roll', 'bob-token'));
      expect(isLocked()).toBe(true);
      expect(button('Rolling…').disabled).toBe(true);
      expect(button('Hold').disabled).toBe(true);
      expect(screen.getByRole('img', { name: 'Rolling the dice…' })).toBeDefined();

      answer(
        jsonResponse(
          200,
          gameState({ activePlayerId: bob.id, roundScore: 7, lastRoll: [3, 4], lastOutcome: 'STANDARD', version: 2 }),
        ),
      );
      await advance();

      expect(screen.getByRole('img', { name: 'Last roll: 3 and 4' })).toBeDefined();
      expect(roundScoreOf('bob')).toBe('7');
      expect(isLocked()).toBe(false);
      expect(button('Roll Dice').disabled).toBe(false);
      expect(button('Hold').disabled).toBe(false);
    });

    it('keeps Hold disabled while the round is empty, and banks the round when it is not', async () => {
      startHumanMatch(gameState({ roundScore: 12, lastRoll: [6, 2], lastOutcome: 'STANDARD' }));
      renderArena();
      respondWith(
        200,
        gameState({
          activePlayerId: bob.id,
          lastOutcome: 'HOLD',
          version: 2,
          players: { player1: seat(alice, 12), player2: seat(bob) },
        }),
      );

      click('Hold');
      await advance();

      expect(sentRequest()).toEqual(turnRequest('game-1', 'hold', 'alice-token'));
      expect(screen.getByRole('progressbar', { name: 'alice global score' }).getAttribute('aria-valuenow')).toBe('12');
      expect(card('bob').getByText('Active Turn')).toBeDefined();
      expect(button('Roll Dice').disabled).toBe(false);
      expect(button('Hold').disabled).toBe(true);
    });

    it("shows the server's reason when an action is rejected", async () => {
      startHumanMatch(gameState({ roundScore: 5 }));
      renderArena();
      respondWith(409, { statusCode: 409, error: 'Conflict', message: 'Game is already finished' });

      click('Roll Dice');
      await advance();

      expect(screen.getByRole('alert').textContent).toBe('Game is already finished');
      expect(isLocked()).toBe(false);
    });
  });

  describe('double six penalty', () => {
    it('locks Roll and Hold for 2 seconds while the banner and red flash play', async () => {
      startHumanMatch(gameState({ roundScore: 15 }));
      renderArena();
      respondWith(
        200,
        gameState({ activePlayerId: bob.id, roundScore: 0, lastRoll: [6, 6], lastOutcome: 'DOUBLE_SIX', version: 2 }),
      );

      click('Roll Dice');
      await advance();

      expect(screen.getByText(PENALTY_BANNER)).toBeDefined();
      expect(screen.getByText('alice loses the round. bob is up.')).toBeDefined();
      expect(screen.getByRole('img', { name: 'Last roll: 6 and 6' })).toBeDefined();
      expect(roundScoreOf('alice')).toBe('0');
      expect(isLocked()).toBe(true);
      expect(button('Roll Dice').disabled).toBe(true);

      await advance(PENALTY_LOCKOUT_MS - 1);
      expect(isLocked()).toBe(true);
      expect(screen.getByText(PENALTY_BANNER)).toBeDefined();

      await advance(1);
      expect(isLocked()).toBe(false);
      expect(screen.queryByText(PENALTY_BANNER)).toBeNull();
      expect(button('Roll Dice').disabled).toBe(false);
    });

    it('ends the lockout early when a new game is started', async () => {
      startHumanMatch(gameState({ roundScore: 15 }));
      renderArena();
      respondWith(200, gameState({ activePlayerId: bob.id, lastRoll: [6, 6], lastOutcome: 'DOUBLE_SIX', version: 2 }));
      click('Roll Dice');
      await advance();
      respondWith(201, gameState({ id: 'game-2' }));

      click('New Game');
      await advance();

      expect(screen.queryByText(PENALTY_BANNER)).toBeNull();
      expect(isLocked()).toBe(false);
      expect(button('Roll Dice').disabled).toBe(false);
    });

    it('releases the lock when the players leave for the lobby mid-lockout', async () => {
      startHumanMatch(gameState({ roundScore: 15 }));
      renderArena();
      respondWith(200, gameState({ activePlayerId: bob.id, lastRoll: [6, 6], lastOutcome: 'DOUBLE_SIX', version: 2 }));
      click('Roll Dice');
      await advance();

      click('Back to lobby');

      expect(useArenaStore.getState().game).toBeNull();
      expect(isLocked()).toBe(false);
    });
  });

  describe('AI turn playback', () => {
    it('plays one AI step every 950 ms until the turn passes back to the human', async () => {
      startAiMatch({ activePlayerId: robo.id });
      renderArena();
      respondWith(
        200,
        aiStep('ROLL', { activePlayerId: robo.id, roundScore: 7, lastRoll: [3, 4], lastOutcome: 'STANDARD', version: 2 }),
      );
      respondWith(
        200,
        aiStep('HOLD', {
          activePlayerId: alice.id,
          lastRoll: [3, 4],
          lastOutcome: 'HOLD',
          version: 3,
          players: { player1: seat(alice), player2: seat(robo, 7) },
        }),
      );

      expect(screen.getByRole('heading', { name: 'RoboRoller is thinking…' })).toBeDefined();
      expect(button('Roll Dice').disabled).toBe(true);
      expect(button('Hold').disabled).toBe(true);

      await advance(AI_STEP_DELAY_MS - 1);
      expect(fetchMock).not.toHaveBeenCalled();

      await advance(1);
      expect(sentRequest(0)).toEqual(turnRequest('game-1', 'ai-step', 'alice-token'));
      expect(roundScoreOf('RoboRoller')).toBe('7');
      expect(button('Roll Dice').disabled).toBe(true);

      await advance(AI_STEP_DELAY_MS);
      expect(sentRequest(1)).toEqual(turnRequest('game-1', 'ai-step', 'alice-token'));
      expect(screen.getByRole('progressbar', { name: 'RoboRoller global score' }).getAttribute('aria-valuenow')).toBe('7');
      expect(card('alice').getByText('Active Turn')).toBeDefined();
      expect(button('Roll Dice').disabled).toBe(false);

      await advance(AI_STEP_DELAY_MS * 3);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stops once the AI wins', async () => {
      startAiMatch({ activePlayerId: robo.id, roundScore: 20 });
      renderArena();
      respondWith(
        200,
        aiStep('HOLD', {
          status: 'FINISHED',
          activePlayerId: robo.id,
          winnerId: robo.id,
          lastOutcome: 'WIN',
          version: 2,
          players: { player1: seat(alice), player2: { ...seat(robo, 100), wins: 6 } },
        }),
      );

      await advance(AI_STEP_DELAY_MS);
      await advance(AI_STEP_DELAY_MS * 3);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('heading', { name: 'RoboRoller wins the match!' })).toBeDefined();
      expect(card('RoboRoller').getByText('6 career wins')).toBeDefined();
    });

    it('waits for the double-six lockout to end before the AI moves', async () => {
      startAiMatch({ roundScore: 10 });
      renderArena();
      respondWith(200, vsAiGame({ activePlayerId: robo.id, lastRoll: [6, 6], lastOutcome: 'DOUBLE_SIX', version: 2 }));

      click('Roll Dice');
      await advance();
      expect(screen.getByText('alice loses the round. RoboRoller is up.')).toBeDefined();

      await advance(PENALTY_LOCKOUT_MS + AI_STEP_DELAY_MS - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      respondWith(200, aiStep('ROLL', { activePlayerId: robo.id, roundScore: 5, lastRoll: [2, 3], version: 3 }));
      await advance(1);
      expect(sentRequest(1)).toEqual(turnRequest('game-1', 'ai-step', 'alice-token'));
    });

    it('shows the penalty when the AI rolls a double six, then hands the dice back', async () => {
      startAiMatch({ activePlayerId: robo.id, roundScore: 14 });
      renderArena();
      respondWith(200, aiStep('ROLL', { activePlayerId: alice.id, lastRoll: [6, 6], lastOutcome: 'DOUBLE_SIX', version: 2 }));

      await advance(AI_STEP_DELAY_MS);

      expect(screen.getByText('RoboRoller loses the round. alice is up.')).toBeDefined();
      expect(button('Roll Dice').disabled).toBe(true);

      await advance(PENALTY_LOCKOUT_MS);
      expect(button('Roll Dice').disabled).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('pauses after a failed step instead of retrying, and resumes when asked', async () => {
      startAiMatch({ activePlayerId: robo.id });
      renderArena();
      respondWith(409, { statusCode: 409, error: 'Conflict', message: 'The game changed before this action could be applied' });

      await advance(AI_STEP_DELAY_MS);
      expect(screen.getByRole('alert').textContent).toBe('The game changed before this action could be applied');

      await advance(AI_STEP_DELAY_MS * 5);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      respondWith(200, aiStep('ROLL', { activePlayerId: robo.id, roundScore: 4, lastRoll: [1, 3], version: 2 }));
      click('Retry RoboRoller’s turn');
      await advance(AI_STEP_DELAY_MS);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(roundScoreOf('RoboRoller')).toBe('4');
    });
  });

  describe('sound cues', () => {
    it('plays the dice when the server reports a standard roll', async () => {
      startHumanMatch();
      renderArena();
      respondWith(200, gameState({ roundScore: 7, lastRoll: [3, 4], lastOutcome: 'STANDARD', version: 2 }));

      click('Roll Dice');
      expect(soundsPlayed()).toEqual({ dice: 0, hold: 0, doubleSix: 0, win: 0 });
      await advance();

      expect(soundsPlayed()).toEqual({ dice: 1, hold: 0, doubleSix: 0, win: 0 });
    });

    it('plays the buzzer for a double six', async () => {
      startHumanMatch(gameState({ roundScore: 15 }));
      renderArena();
      respondWith(200, gameState({ activePlayerId: bob.id, lastRoll: [6, 6], lastOutcome: 'DOUBLE_SIX', version: 2 }));

      click('Roll Dice');
      await advance();

      expect(soundsPlayed()).toEqual({ dice: 0, hold: 0, doubleSix: 1, win: 0 });
    });

    it('plays the chime when a round is banked', async () => {
      startHumanMatch(gameState({ roundScore: 12 }));
      renderArena();
      respondWith(200, gameState({ activePlayerId: bob.id, lastOutcome: 'HOLD', version: 2 }));

      click('Hold');
      await advance();

      expect(soundsPlayed()).toEqual({ dice: 0, hold: 1, doubleSix: 0, win: 0 });
    });

    it('plays the fanfare when the hold wins the match', async () => {
      startHumanMatch(gameState({ roundScore: 12, players: { player1: seat(alice, 95), player2: seat(bob) } }));
      renderArena();
      respondWith(
        200,
        gameState({
          status: 'FINISHED',
          winnerId: alice.id,
          lastOutcome: 'WIN',
          version: 2,
          players: { player1: { ...seat(alice, 107), wins: 3 }, player2: seat(bob) },
        }),
      );

      click('Hold');
      await advance();

      expect(soundsPlayed()).toEqual({ dice: 0, hold: 0, doubleSix: 0, win: 1 });
    });

    it("plays the AI's outcomes as its steps come back", async () => {
      startAiMatch({ activePlayerId: robo.id });
      renderArena();
      respondWith(200, aiStep('ROLL', { activePlayerId: robo.id, roundScore: 8, lastRoll: [5, 3], lastOutcome: 'STANDARD', version: 2 }));
      respondWith(
        200,
        aiStep('HOLD', {
          activePlayerId: alice.id,
          lastRoll: [5, 3],
          lastOutcome: 'HOLD',
          version: 3,
          players: { player1: seat(alice), player2: seat(robo, 8) },
        }),
      );

      await advance(AI_STEP_DELAY_MS);
      expect(soundsPlayed()).toEqual({ dice: 1, hold: 0, doubleSix: 0, win: 0 });

      await advance(AI_STEP_DELAY_MS);
      expect(soundsPlayed()).toEqual({ dice: 1, hold: 1, doubleSix: 0, win: 0 });
    });

    it('stays silent when the server rejects the action', async () => {
      startHumanMatch(gameState({ roundScore: 5 }));
      renderArena();
      respondWith(409, { statusCode: 409, error: 'Conflict', message: 'Game is already finished' });

      click('Roll Dice');
      await advance();

      expect(soundsPlayed()).toEqual({ dice: 0, hold: 0, doubleSix: 0, win: 0 });
    });
  });

  describe('New Game', () => {
    it('restarts mid-match with the target score typed in', async () => {
      startHumanMatch(gameState({ roundScore: 8, players: { player1: seat(alice, 30), player2: seat(bob, 12) } }));
      renderArena();
      const input = screen.getByLabelText<HTMLInputElement>('Target score');
      expect(input.value).toBe('100');

      fireEvent.change(input, { target: { value: '5' } });
      expect(screen.getByText('Target score must be at least 10')).toBeDefined();
      expect(button('New Game').disabled).toBe(true);

      respondWith(201, gameState({ id: 'game-2', targetScore: 250 }));
      fireEvent.change(input, { target: { value: '250' } });
      click('New Game');
      await advance();

      expect(sentRequest()).toEqual({
        url: `${env.apiBaseUrl}/games/game-1/reset`,
        method: 'POST',
        authorization: 'Bearer alice-token',
        body: { targetScore: 250 },
      });
      expect(useArenaStore.getState().game?.id).toBe('game-2');
      expect(screen.getByText('First to 250 points')).toBeDefined();
      expect(roundScoreOf('alice')).toBe('0');
    });
  });
});
