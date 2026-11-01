import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceDisplay } from './DiceDisplay';

function shownFaces(): (string | null)[] {
  return [...screen.getByRole('img').querySelectorAll('[data-face]')].map((die) => die.getAttribute('data-face'));
}

describe('DiceDisplay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows blank dice before the first roll', () => {
    render(<DiceDisplay roll={null} rolling={false} penalty={false} />);

    expect(screen.getByRole('img', { name: 'No dice rolled yet' })).toBeDefined();
    expect(shownFaces()).toEqual([]);
  });

  it("shows the server's roll", () => {
    render(<DiceDisplay roll={[6, 1]} rolling={false} penalty={false} />);

    expect(screen.getByRole('img', { name: 'Last roll: 6 and 1' })).toBeDefined();
    expect(shownFaces()).toEqual(['6', '1']);
  });

  it("tumbles while the roll is in flight, then lands on the server's roll", () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { rerender } = render(<DiceDisplay roll={[2, 2]} rolling penalty={false} />);
    expect(screen.getByRole('img', { name: 'Rolling the dice…' })).toBeDefined();
    const firstFrame = shownFaces();

    act(() => vi.advanceTimersByTime(90));
    expect(shownFaces()).not.toEqual(firstFrame);

    rerender(<DiceDisplay roll={[5, 4]} rolling={false} penalty={false} />);
    expect(screen.getByRole('img', { name: 'Last roll: 5 and 4' })).toBeDefined();
    expect(shownFaces()).toEqual(['5', '4']);
  });
});
