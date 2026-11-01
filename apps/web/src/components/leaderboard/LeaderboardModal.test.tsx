import type { LeaderboardDto } from '@dice-arena/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env';
import { useArenaStore } from '../../store/useArenaStore';
import { alice, bob } from '../../test/fixtures';
import { fetchMock, respondWith, sentRequest } from '../../test/http';
import { LeaderboardModal } from './LeaderboardModal';

const standings: LeaderboardDto = [
  { id: alice.id, username: 'alice', wins: 7, gamesPlayed: 9, winRatePercent: 77.8 },
  { id: 'user-carol', username: 'carol', wins: 4, gamesPlayed: 10, winRatePercent: 40 },
  { id: bob.id, username: 'bob', wins: 1, gamesPlayed: 3, winRatePercent: 33.3 },
];

async function rows(): Promise<HTMLElement[]> {
  return within(await screen.findByRole('list', { name: 'Top players' })).getAllByRole('listitem');
}

describe('LeaderboardModal', () => {
  beforeEach(() => {
    useArenaStore.setState(useArenaStore.getInitialState(), true);
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch while closed', () => {
    render(<LeaderboardModal open={false} onClose={vi.fn()} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the public leaderboard when opened and lists it in server order', async () => {
    respondWith(200, standings);
    render(<LeaderboardModal open onClose={vi.fn()} />);

    const [first, second, third] = await rows();

    expect(sentRequest()).toEqual({
      url: `${env.apiBaseUrl}/users/leaderboard`,
      method: 'GET',
      authorization: null,
      body: undefined,
    });
    expect(within(first!).getByLabelText('Rank 1').textContent).toBe('1');
    expect(within(first!).getByText('alice')).toBeDefined();
    expect(within(first!).getByText('9 played · 77.8% win rate')).toBeDefined();
    expect(within(first!).getByText('7')).toBeDefined();
    expect(within(second!).getByText('carol')).toBeDefined();
    expect(within(third!).getByText('bob')).toBeDefined();
  });

  it('marks the players signed in on this device', async () => {
    const { setSession } = useArenaStore.getState();
    setSession('slot1', { user: alice, accessToken: 'alice-token' });
    setSession('slot2', { user: bob, accessToken: 'bob-token' });
    respondWith(200, standings);
    render(<LeaderboardModal open onClose={vi.fn()} />);

    const [first, second, third] = await rows();

    expect(within(first!).getByTitle('Signed in as Player 1').textContent).toBe('P1');
    expect(within(second!).queryByTitle(/Signed in as/)).toBeNull();
    expect(within(third!).getByTitle('Signed in as Player 2').textContent).toBe('P2');
  });

  it('explains an empty board', async () => {
    respondWith(200, []);
    render(<LeaderboardModal open onClose={vi.fn()} />);

    expect(await screen.findByText('No players yet. Register and win a match to claim the top spot.')).toBeDefined();
  });

  it('shows the failure and retries on request', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<LeaderboardModal open onClose={vi.fn()} />);

    expect((await screen.findByRole('alert')).textContent).toBe('Could not reach the Dice Arena server');

    respondWith(200, standings);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await rows()).toHaveLength(standings.length);
  });

  it('refetches on Refresh so new wins show up without reopening', async () => {
    const user = userEvent.setup();
    respondWith(200, standings);
    render(<LeaderboardModal open onClose={vi.fn()} />);
    await rows();

    respondWith(200, [{ ...standings[1]!, wins: 8 }, standings[0]!]);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    const [first] = await rows();
    expect(within(first!).getByText('carol')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('closes from the close button and from a click on the backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    respondWith(200, standings);
    render(<LeaderboardModal open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close leaderboard' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
