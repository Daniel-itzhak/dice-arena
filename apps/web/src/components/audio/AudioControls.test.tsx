import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioSettings } from '../../audio/soundEngine';
import { armOnFirstGesture, toggleAmbientMusic, toggleMute } from '../../audio/soundEngine';
import { AudioControls } from './AudioControls';

/** A stand-in for the engine's settings store, so the component is tested apart from Web Audio itself. */
const fakeEngine = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    settings: { muted: false, musicEnabled: true } as AudioSettings,
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
  toggleMute: vi.fn(() => fakeEngine.update({ muted: !fakeEngine.state.settings.muted })),
  toggleAmbientMusic: vi.fn(() => fakeEngine.update({ musicEnabled: !fakeEngine.state.settings.musicEnabled })),
  armOnFirstGesture: vi.fn(() => fakeEngine.state.disarm),
}));

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name });
}

describe('AudioControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeEngine.state.settings = { muted: false, musicEnabled: true };
    fakeEngine.state.supported = true;
  });

  it('mutes and unmutes every sound through the engine', () => {
    render(<AudioControls />);
    expect(button('Mute').title).toBe('Mute all sounds');

    fireEvent.click(button('Mute'));
    expect(toggleMute).toHaveBeenCalledOnce();
    expect(button('Unmute').title).toBe('Unmute all sounds');

    fireEvent.click(button('Unmute'));
    expect(toggleMute).toHaveBeenCalledTimes(2);
    expect(button('Mute')).toBeDefined();
  });

  it('turns the ambient music off and on, exposing the state as a pressed toggle', () => {
    render(<AudioControls />);
    expect(button('Music').getAttribute('aria-pressed')).toBe('true');
    expect(button('Music').title).toBe('Turn ambient music off');

    fireEvent.click(button('Music'));
    expect(toggleAmbientMusic).toHaveBeenCalledOnce();
    expect(button('Music').getAttribute('aria-pressed')).toBe('false');
    expect(button('Music').title).toBe('Turn ambient music on');

    fireEvent.click(button('Music'));
    expect(button('Music').getAttribute('aria-pressed')).toBe('true');
  });

  it('reflects changes made to the settings elsewhere', () => {
    render(<AudioControls />);

    act(() => fakeEngine.update({ muted: true }));

    expect(button('Unmute')).toBeDefined();
  });

  it('arms the first-gesture unlock while mounted and disarms it on unmount', () => {
    const { unmount } = render(<AudioControls />);
    expect(armOnFirstGesture).toHaveBeenCalledOnce();
    expect(fakeEngine.state.disarm).not.toHaveBeenCalled();

    unmount();
    expect(fakeEngine.state.disarm).toHaveBeenCalledOnce();
  });

  it('disables both toggles where the Web Audio API is missing', () => {
    fakeEngine.state.supported = false;
    render(<AudioControls />);

    expect(button('Mute').disabled).toBe(true);
    expect(button('Music').disabled).toBe(true);
    expect(button('Mute').title).toBe('This browser does not support the Web Audio API');
  });
});
