import { AI_PLAYER_USERNAME } from '@dice-arena/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env';
import { useArenaStore } from '../../store/useArenaStore';
import { alice, bob, gameState, robo, seat } from '../../test/fixtures';
import { fetchMock, respondWith, sentRequest } from '../../test/http';
import { DualAuthPanel } from './DualAuthPanel';

type PlayerLabel = 'Player 1' | 'Player 2';

function renderLobby(): UserEvent {
  const user = userEvent.setup();
  render(<DualAuthPanel />);
  return user;
}

function card(label: PlayerLabel) {
  return within(screen.getByRole('region', { name: label }));
}

function startButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: 'Start Match' });
}

async function fillCredentials(user: UserEvent, label: PlayerLabel, username: string, password = 'correct-horse') {
  await user.type(card(label).getByLabelText('Username'), username);
  await user.type(card(label).getByLabelText('Password'), password);
}

async function signIn(user: UserEvent, label: PlayerLabel, username: string, password?: string): Promise<void> {
  await fillCredentials(user, label, username, password);
  await user.click(card(label).getByRole('button', { name: `Sign in as ${label}` }));
}

function signInBothHumans(): void {
  const { setSession } = useArenaStore.getState();
  setSession('slot1', { user: alice, accessToken: 'alice-token' });
  setSession('slot2', { user: bob, accessToken: 'bob-token' });
}

describe('DualAuthPanel', () => {
  beforeEach(() => {
    useArenaStore.setState(useArenaStore.getInitialState(), true);
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Player 1', () => {
    it('signs in, then shows the badge with total wins and a Switch Account button', async () => {
      const user = renderLobby();
      respondWith(200, { accessToken: 'alice-token', user: alice });

      await signIn(user, 'Player 1', 'alice');

      expect(sentRequest()).toEqual({
        url: `${env.apiBaseUrl}/auth/login`,
        method: 'POST',
        authorization: null,
        body: { username: 'alice', password: 'correct-horse' },
      });
      const badge = card('Player 1');
      expect(badge.getByText('alice')).toBeDefined();
      expect(badge.getByText('Total wins').nextElementSibling?.textContent).toBe(String(alice.wins));
      expect(badge.getByText('Ready')).toBeDefined();

      await user.click(badge.getByRole('button', { name: 'Switch Account' }));

      expect(useArenaStore.getState().slot1).toEqual({ user: null, token: null });
      expect(card('Player 1').getByLabelText('Username')).toBeDefined();
    });

    it('toggles password visibility on Sign in and Register', async () => {
      const user = renderLobby();
      const password = card('Player 1').getByLabelText<HTMLInputElement>('Password');
      expect(password.type).toBe('password');

      await user.click(card('Player 1').getByRole('button', { name: 'Show password' }));
      expect(password.type).toBe('text');

      await user.click(card('Player 1').getByRole('button', { name: 'Register' }));
      expect(card('Player 1').getByLabelText<HTMLInputElement>('Password').type).toBe('text');

      await user.click(card('Player 1').getByRole('button', { name: 'Hide password' }));
      expect(card('Player 1').getByLabelText<HTMLInputElement>('Password').type).toBe('password');
    });

    it('creates an account from the Register tab', async () => {
      const user = renderLobby();
      respondWith(201, { accessToken: 'alice-token', user: alice });

      await user.click(card('Player 1').getByRole('button', { name: 'Register' }));
      await fillCredentials(user, 'Player 1', 'alice');
      await user.click(card('Player 1').getByRole('button', { name: 'Create Player 1 account' }));

      expect(sentRequest()).toMatchObject({ url: `${env.apiBaseUrl}/auth/register`, method: 'POST' });
      expect(useArenaStore.getState().slot1.user).toEqual(alice);
    });

    it('checks credentials against the shared schema before calling the API', async () => {
      const user = renderLobby();

      await signIn(user, 'Player 1', 'al', 'short');

      expect(card('Player 1').getByText('Username must be at least 3 characters')).toBeDefined();
      expect(card('Player 1').getByText('Password must be at least 8 characters')).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows the server's reason when sign-in is rejected", async () => {
      const user = renderLobby();
      respondWith(401, { statusCode: 401, error: 'Unauthorized', message: 'Invalid username or password' });

      await signIn(user, 'Player 1', 'alice');

      expect((await card('Player 1').findByRole('alert')).textContent).toBe('Invalid username or password');
      expect(useArenaStore.getState().slot1.user).toBeNull();
    });
  });

  describe('Player 2', () => {
    it("refuses Player 1's username without calling the API", async () => {
      useArenaStore.getState().setSession('slot1', { user: alice, accessToken: 'alice-token' });
      const user = renderLobby();

      await signIn(user, 'Player 2', 'alice');

      expect(card('Player 2').getByText('alice is already signed in as Player 1')).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(useArenaStore.getState().slot2.user).toBeNull();
    });

    it("still refuses when the server answers with Player 1's account", async () => {
      useArenaStore.getState().setSession('slot1', { user: alice, accessToken: 'alice-token' });
      const user = renderLobby();
      respondWith(200, { accessToken: 'second-alice-token', user: alice });

      await signIn(user, 'Player 2', 'alias');

      expect((await card('Player 2').findByRole('alert')).textContent).toBe(
        'alice is already signed in as the other player',
      );
      expect(useArenaStore.getState().slot2).toEqual({ user: null, token: null, isAiMode: false });
    });

    it('signs a second human in on the same page', async () => {
      useArenaStore.getState().setSession('slot1', { user: alice, accessToken: 'alice-token' });
      const user = renderLobby();
      respondWith(200, { accessToken: 'bob-token', user: bob });

      await signIn(user, 'Player 2', 'bob');

      expect(card('Player 2').getByText('bob')).toBeDefined();
      expect(useArenaStore.getState()).toMatchObject({
        slot1: { user: alice, token: 'alice-token' },
        slot2: { user: bob, token: 'bob-token', isAiMode: false },
      });
    });

    it('loads RoboRoller from the API when the AI opponent is chosen', async () => {
      const user = renderLobby();
      respondWith(200, robo);

      await user.click(screen.getByRole('button', { name: `AI Opponent (${AI_PLAYER_USERNAME})` }));

      expect(await card('Player 2').findByText(AI_PLAYER_USERNAME)).toBeDefined();
      expect(sentRequest()).toMatchObject({ url: `${env.apiBaseUrl}/users/ai`, method: 'GET' });
      expect(useArenaStore.getState().slot2).toEqual({ user: robo, token: null, isAiMode: true });
      expect(card('Player 2').queryByRole('button', { name: 'Switch Account' })).toBeNull();
    });

    it('signs the human Player 2 out when switching to the AI, and clears the AI when switching back', async () => {
      signInBothHumans();
      const user = renderLobby();
      respondWith(200, robo);

      await user.click(screen.getByRole('button', { name: `AI Opponent (${AI_PLAYER_USERNAME})` }));
      await card('Player 2').findByText(AI_PLAYER_USERNAME);
      await user.click(screen.getByRole('button', { name: 'Human Player 2' }));

      expect(useArenaStore.getState().slot2).toEqual({ user: null, token: null, isAiMode: false });
      expect(card('Player 2').getByLabelText('Username')).toBeDefined();
      expect(useArenaStore.getState().slot1.user).toEqual(alice);
    });

    it('offers a retry when the AI cannot be loaded, without leaving Player 2 ready', async () => {
      signInBothHumans();
      const user = renderLobby();
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await user.click(screen.getByRole('button', { name: `AI Opponent (${AI_PLAYER_USERNAME})` }));

      expect((await card('Player 2').findByRole('alert')).textContent).toBe('Could not reach the Dice Arena server');
      expect(startButton().disabled).toBe(true);

      respondWith(200, robo);
      await user.click(card('Player 2').getByRole('button', { name: 'Try again' }));

      expect(await card('Player 2').findByText(AI_PLAYER_USERNAME)).toBeDefined();
      expect(startButton().disabled).toBe(false);
    });
  });

  describe('Start Match', () => {
    it('stays disabled until both slots are signed in, saying what is missing', async () => {
      const user = renderLobby();
      expect(startButton().disabled).toBe(true);
      expect(screen.getByText('Waiting for Player 1 to sign in')).toBeDefined();

      respondWith(200, { accessToken: 'alice-token', user: alice });
      await signIn(user, 'Player 1', 'alice');
      expect(startButton().disabled).toBe(true);
      expect(screen.getByText('Waiting for Player 2 to sign in or pick the AI')).toBeDefined();

      respondWith(200, { accessToken: 'bob-token', user: bob });
      await signIn(user, 'Player 2', 'bob');
      expect(startButton().disabled).toBe(false);
      expect(screen.getByText('alice vs bob · first to 100')).toBeDefined();
    });

    it("creates the game with slot1's token and stores the server's state", async () => {
      signInBothHumans();
      const user = renderLobby();
      const game = gameState();
      respondWith(201, game);

      await user.click(startButton());

      expect(sentRequest()).toEqual({
        url: `${env.apiBaseUrl}/games`,
        method: 'POST',
        authorization: 'Bearer alice-token',
        body: { player1Id: alice.id, player2Id: bob.id, isVsAi: false, targetScore: 100 },
      });
      expect(useArenaStore.getState().game).toEqual(game);
    });

    it('starts a vs-AI match once RoboRoller is chosen', async () => {
      useArenaStore.getState().setSession('slot1', { user: alice, accessToken: 'alice-token' });
      const user = renderLobby();
      respondWith(200, robo);
      await user.click(screen.getByRole('button', { name: `AI Opponent (${AI_PLAYER_USERNAME})` }));
      await card('Player 2').findByText(AI_PLAYER_USERNAME);
      respondWith(201, gameState({ players: { player1: seat(alice), player2: seat(robo) } }));

      await user.click(startButton());

      expect(sentRequest(1).body).toEqual({ player1Id: alice.id, player2Id: robo.id, isVsAi: true, targetScore: 100 });
    });

    it('sends the selected quick-pick target score', async () => {
      signInBothHumans();
      const user = renderLobby();
      respondWith(201, gameState({ targetScore: 200 }));

      await user.click(screen.getByRole('button', { name: '200' }));
      await user.click(startButton());

      expect(sentRequest()).toMatchObject({ body: { targetScore: 200 } });
    });

    it('validates a custom target score with the shared schema', async () => {
      signInBothHumans();
      const user = renderLobby();

      await user.click(screen.getByRole('button', { name: 'Custom' }));
      const input = screen.getByLabelText<HTMLInputElement>('Custom target score');
      expect(input.value).toBe('100');

      await user.clear(input);
      await user.type(input, '5');
      expect(screen.getByText('Target score must be at least 10')).toBeDefined();
      expect(screen.getByText('Choose a valid target score')).toBeDefined();
      expect(startButton().disabled).toBe(true);

      respondWith(201, gameState({ targetScore: 250 }));
      await user.clear(input);
      await user.type(input, '250');
      await user.click(startButton());

      expect(sentRequest()).toMatchObject({ body: { targetScore: 250 } });
    });

    it("asks Player 1 to sign in again when the API rejects slot1's token", async () => {
      signInBothHumans();
      const user = renderLobby();
      respondWith(401, { statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired access token' });

      await user.click(startButton());

      expect((await screen.findByRole('alert')).textContent).toBe(
        'Player 1’s session has expired. Use Switch Account to sign in again.',
      );
      expect(useArenaStore.getState().game).toBeNull();
    });
  });
});
