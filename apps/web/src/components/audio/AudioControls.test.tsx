import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioSettings } from '../../audio/soundEngine';
import { armOnFirstGesture, toggleAmbientMusic } from '../../audio/soundEngine';
import { AudioControls } from './AudioControls';

/** A stand-in for the engine's settings store, so the component is tested apart from Web Audio itself. */
const fakeEngine = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    settings: { muted: false, musicEnabled: false } as AudioSettings,
    supported: true,
    disarm: vi.fn(),
  };
  return {
    state,
    update(patch: Partial<AudioSettings>): void {
      state.settings = { ...state.settings, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock('../../audio/soundEngine', () => ({
  getAudioSettings: () => fakeEngine.state.settings,
  subscribeToAudioSettings: fakeEngine.subscribe,
  isAudioSupported: () => fakeEngine.state.supported,
  toggleAmbientMusic: vi.fn(() => fakeEngine.update({ musicEnabled: !fakeEngine.state.settings.musicEnabled })),
  armOnFirstGesture: vi.fn(() => fakeEngine.state.disarm),
}));

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name });
}

describe('AudioControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeEngine.state.settings = { muted: false, musicEnabled: false };
    fakeEngine.state.supported = true;
  });

  it('starts as Music off and toggles the ambient loop through the engine', () => {
    render(<AudioControls />);
    expect(button('Music off').getAttribute('aria-pressed')).toBe('false');
    expect(button('Music off').title).toBe('Turn ambient music on');

    fireEvent.click(button('Music off'));
    expect(toggleAmbientMusic).toHaveBeenCalledOnce();
    expect(button('Music on').getAttribute('aria-pressed')).toBe('true');
    expect(button('Music on').title).toBe('Turn ambient music off');

    fireEvent.click(button('Music on'));
    expect(button('Music off').getAttribute('aria-pressed')).toBe('false');
  });

  it('reflects changes made to the settings elsewhere', () => {
    render(<AudioControls />);

    act(() => fakeEngine.update({ musicEnabled: true }));

    expect(button('Music on')).toBeDefined();
  });

  it('arms the first-gesture unlock while mounted and disarms it on unmount', () => {
    const { unmount } = render(<AudioControls />);
    expect(armOnFirstGesture).toHaveBeenCalledOnce();
    expect(fakeEngine.state.disarm).not.toHaveBeenCalled();

    unmount();
    expect(fakeEngine.state.disarm).toHaveBeenCalledOnce();
  });

  it('disables the toggle where the Web Audio API is missing', () => {
    fakeEngine.state.supported = false;
    render(<AudioControls />);

    expect(button('Music off').disabled).toBe(true);
    expect(button('Music off').title).toBe('This browser does not support the Web Audio API');
  });
});
