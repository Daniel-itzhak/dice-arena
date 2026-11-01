import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeAudioContext,
  installFakeAudioContext,
  onlyAudioContext,
  padOscillators,
  sparkleOscillators,
} from '../test/fakeAudioContext';

type SoundEngine = typeof import('./soundEngine');

/** The engine keeps module-level state (settings, context), so every test gets a fresh copy. */
async function loadEngine(): Promise<SoundEngine> {
  vi.resetModules();
  return import('./soundEngine');
}

describe('soundEngine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('without the Web Audio API', () => {
    it('reports no support and turns every cue into a silent no-op', async () => {
      const engine = await loadEngine();

      expect(engine.isAudioSupported()).toBe(false);
      expect(() => {
        engine.playDiceRoll();
        engine.playHold();
        engine.playDoubleSix();
        engine.playWin();
        engine.toggleAmbientMusic();
        engine.toggleMute();
      }).not.toThrow();
      expect(engine.getAudioSettings()).toEqual({ muted: true, musicEnabled: true });
    });
  });

  describe('with the Web Audio API', () => {
    beforeEach(() => {
      installFakeAudioContext();
    });

    it('creates one context lazily on the first cue, resumes it, and reuses it afterwards', async () => {
      const engine = await loadEngine();
      expect(FakeAudioContext.instances).toHaveLength(0);

      engine.playDiceRoll();
      const context = onlyAudioContext();
      expect(context.resume).toHaveBeenCalledOnce();
      expect(context.gains[0]?.connect).toHaveBeenCalledWith(context.destination);

      engine.playHold();
      engine.playWin();
      expect(FakeAudioContext.instances).toHaveLength(1);
    });

    it('plays the dice roll as a band-passed noise burst', async () => {
      const engine = await loadEngine();

      engine.playDiceRoll();

      const context = onlyAudioContext();
      const [source] = context.bufferSources;
      expect(source?.buffer).not.toBeNull();
      expect(source?.start).toHaveBeenCalledOnce();
      expect(source?.stop).toHaveBeenCalledOnce();
      expect(context.filters.some((filter) => filter.type === 'bandpass')).toBe(true);
    });

    it('plays the hold as three rising notes and the double six as descending sawtooth waves', async () => {
      const engine = await loadEngine();

      engine.playHold();
      const context = onlyAudioContext();
      const holdNotes = context.oscillators.map((osc) => osc.frequency.firstScheduledValue());
      expect(holdNotes).toEqual([523.25, 659.25, 783.99]);

      engine.playDoubleSix();
      const saws = context.oscillators.filter((osc) => osc.type === 'sawtooth');
      expect(saws).toHaveLength(3);
      for (const saw of saws) {
        const from = saw.frequency.firstScheduledValue() ?? Number.NaN;
        const to = saw.frequency.exponentialRampToValueAtTime.mock.calls[0]?.[0] ?? Number.NaN;
        expect(to).toBeLessThan(from);
      }
    });

    it('plays nothing while muted, and does not even create a context for it', async () => {
      const engine = await loadEngine();

      engine.toggleMute();
      engine.playDiceRoll();
      engine.playWin();

      expect(engine.getAudioSettings().muted).toBe(true);
      expect(FakeAudioContext.instances).toHaveLength(0);
    });

    it('fades the master bus to 0 on mute and back to 1 on unmute', async () => {
      const engine = await loadEngine();
      engine.playHold();
      const master = onlyAudioContext().gains[0];

      engine.toggleMute();
      expect(master?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, expect.any(Number), expect.any(Number));

      engine.toggleMute();
      expect(master?.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, expect.any(Number), expect.any(Number));
    });

    it('does not start the pad until music is turned on', async () => {
      const engine = await loadEngine();

      engine.playHold();
      expect(padOscillators(onlyAudioContext())).toHaveLength(0);

      engine.toggleAmbientMusic();
      expect(engine.getAudioSettings().musicEnabled).toBe(true);
      expect(padOscillators(onlyAudioContext())).toHaveLength(8);
    });

    it('starts the ambient pad when music is turned on and stops it when turned off', async () => {
      const engine = await loadEngine();

      engine.toggleAmbientMusic();
      const context = onlyAudioContext();
      const pad = padOscillators(context);
      expect(pad).toHaveLength(8);
      expect(pad.every((osc) => osc.start.mock.calls.length === 1)).toBe(true);

      engine.toggleAmbientMusic();
      expect(engine.getAudioSettings().musicEnabled).toBe(false);
      expect(pad.every((osc) => osc.stop.mock.calls.length === 1)).toBe(true);

      engine.toggleAmbientMusic();
      expect(padOscillators(context)).toHaveLength(16);
    });

    it('silences the pad while muted and brings it back on unmute', async () => {
      const engine = await loadEngine();
      engine.toggleAmbientMusic();
      const context = onlyAudioContext();

      engine.toggleMute();
      expect(padOscillators(context).every((osc) => osc.stop.mock.calls.length === 1)).toBe(true);

      engine.toggleMute();
      expect(padOscillators(context)).toHaveLength(16);
    });

    it('schedules the next pass of the progression before the current one ends', async () => {
      vi.useFakeTimers();
      const engine = await loadEngine();
      engine.toggleAmbientMusic();
      const context = onlyAudioContext();
      const sparklesPerLoop = sparkleOscillators(context).length;
      expect(sparklesPerLoop).toBe(8);

      vi.advanceTimersByTime(16_000);

      expect(sparkleOscillators(context)).toHaveLength(sparklesPerLoop * 2);
    });

    it('waits for the first gesture after a reload before restarting enabled music', async () => {
      localStorage.setItem('dice-arena:audio:v2', JSON.stringify({ muted: false, musicEnabled: true }));
      const engine = await loadEngine();
      const disarm = engine.armOnFirstGesture();
      expect(FakeAudioContext.instances).toHaveLength(0);

      window.dispatchEvent(new Event('pointerdown'));
      expect(padOscillators(onlyAudioContext())).toHaveLength(8);

      window.dispatchEvent(new Event('pointerdown'));
      expect(FakeAudioContext.instances).toHaveLength(1);
      disarm();
    });

    it('does not start music when the first gesture is a Music click', async () => {
      localStorage.setItem('dice-arena:audio:v2', JSON.stringify({ muted: false, musicEnabled: true }));
      const engine = await loadEngine();
      const disarm = engine.armOnFirstGesture();
      const control = document.createElement('button');
      control.setAttribute('data-audio-control', '');
      document.body.append(control);

      control.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      expect(FakeAudioContext.instances).toHaveLength(0);
      control.remove();
      disarm();
    });

    it('does not start anything on the first gesture when music is off', async () => {
      const engine = await loadEngine();
      const disarm = engine.armOnFirstGesture();

      window.dispatchEvent(new Event('keydown'));

      expect(FakeAudioContext.instances).toHaveLength(0);
      disarm();
    });
  });

  describe('settings', () => {
    it('defaults to unmuted with music off', async () => {
      const engine = await loadEngine();
      expect(engine.getAudioSettings()).toEqual({ muted: false, musicEnabled: false });
    });

    it('persists every change and restores it on the next load', async () => {
      const engine = await loadEngine();
      engine.toggleMute();
      engine.toggleAmbientMusic();
      expect(JSON.parse(localStorage.getItem(engine.AUDIO_STORAGE_KEY) ?? '')).toEqual({ muted: true, musicEnabled: true });

      const reloaded = await loadEngine();
      expect(reloaded.getAudioSettings()).toEqual({ muted: true, musicEnabled: true });
    });

    it('falls back to the defaults when the stored value is not valid', async () => {
      localStorage.setItem('dice-arena:audio:v2', '{"muted":"yes"}');
      const engine = await loadEngine();
      expect(engine.getAudioSettings()).toEqual({ muted: false, musicEnabled: false });
    });

    it('notifies subscribers on each change until they unsubscribe', async () => {
      const engine = await loadEngine();
      const listener = vi.fn();
      const unsubscribe = engine.subscribeToAudioSettings(listener);

      engine.toggleMute();
      engine.toggleAmbientMusic();
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      engine.toggleMute();
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
