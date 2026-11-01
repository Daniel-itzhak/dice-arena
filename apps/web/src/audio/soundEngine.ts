import { z } from 'zod';

/**
 * Procedural audio for the arena, synthesised with the Web Audio API so the app ships no sound files.
 *
 * Every cue is a pure presentation effect: `GameArena` calls `play*` after the API has reported what
 * happened, so this module never decides anything about the game. It also owns the user's audio
 * preferences (mute and ambient music), which React reads through `useAudioSettings`.
 *
 * Browsers only let an `AudioContext` make sound after a user gesture, so the context is created
 * lazily on the first cue or toggle, and `armOnFirstGesture` restarts the ambient loop after a reload.
 * Where the Web Audio API is missing (older browsers, test environments) every function is a no-op.
 */

/** User-facing audio preferences, persisted across reloads. */
export interface AudioSettings {
  /** Silences everything: sound effects and the ambient loop alike. */
  muted: boolean;
  /** Whether the ambient loop plays whenever audio is not muted. */
  musicEnabled: boolean;
}

export const AUDIO_STORAGE_KEY = 'dice-arena:audio:v2';

/** Marks the Music button so a first-gesture unlock does not start the loop on the same click that toggles it. */
export const AUDIO_CONTROL_SELECTOR = '[data-audio-control]';

const DEFAULT_SETTINGS: AudioSettings = { muted: false, musicEnabled: false };

/** Anything in localStorage that fails this schema (tampered, or written by an older build) is discarded. */
const AudioSettingsSchema = z.object({ muted: z.boolean(), musicEnabled: z.boolean() });

/** Sound-effect bus level; the ambient bus sits below it so music never masks a roll. */
const SFX_LEVEL = 0.8;
const MUSIC_LEVEL = 0.22;
const MUSIC_FADE_IN_SECONDS = 0.35;
const MUSIC_FADE_OUT_SECONDS = 0.35;
/** Time constant for mute and unmute, long enough that the master bus never clicks. */
const MUTE_RAMP_SECONDS = 0.02;
/** Exponential ramps cannot reach 0, so envelopes decay to this instead. */
const SILENCE = 0.0001;
const ATTACK_SECONDS = 0.012;

/** Equal-temperament pitches in Hz (A4 = 440). */
const NOTE = {
  A1: 55.0,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  E4: 329.63,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
} as const;

/** The ratio of an augmented fourth, the most dissonant interval against a root. */
const TRITONE = Math.SQRT2;

const NOISE_SECONDS = 0.5;
/** When each die "lands" during a roll, and how long the whole clatter lasts. */
const DICE_CLATTER_OFFSETS: readonly number[] = [0, 0.055, 0.12, 0.2, 0.29, 0.37];
const DICE_ROLL_SECONDS = 0.45;

const HOLD_TRIAD: readonly number[] = [NOTE.C5, NOTE.E5, NOTE.G5];
const HOLD_NOTE_SPACING_SECONDS = 0.09;

const DOUBLE_SIX_SECONDS = 0.8;

const WIN_ARPEGGIO: readonly number[] = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6];
const WIN_NOTE_SPACING_SECONDS = 0.1;
const WIN_CHORD: readonly number[] = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];

type Chord = readonly [number, number, number, number];
/** C, G, F, C: a bright major I–V–IV–I loop so the lobby reads as a game theme, not a minor drone. */
const AMBIENT_PROGRESSION: readonly Chord[] = [
  [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4],
  [NOTE.G2, NOTE.D3, NOTE.G3, NOTE.B3],
  [NOTE.F2, NOTE.C3, NOTE.F3, NOTE.A3],
  [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4],
];
const AMBIENT_CHORD_SECONDS = 4;
const AMBIENT_LOOP_SECONDS = AMBIENT_PROGRESSION.length * AMBIENT_CHORD_SECONDS;
/** How far ahead the next loop is scheduled; large enough to survive background-tab timer throttling. */
const AMBIENT_LOOKAHEAD_SECONDS = 2;
/** Time constant of the glide between chords. */
const AMBIENT_GLIDE_SECONDS = 0.35;
/** Beats within each chord at which a soft high "sparkle" note is plucked. */
const AMBIENT_SPARKLE_BEATS: readonly number[] = [0.5, 2.25];
/** Sparkles sound two octaves above the pad voice they borrow. */
const AMBIENT_SPARKLE_OCTAVES = 4;
/** Cents either side of the written pitch for the two oscillators of each pad voice. */
const AMBIENT_DETUNE_CENTS = 6;

interface Engine {
  readonly ctx: AudioContext;
  /** Everything passes through here; mute drives its gain to 0. */
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
  /** White noise shared by every dice roll. */
  readonly noise: AudioBuffer;
}

interface AmbientLoop {
  readonly engine: Engine;
  readonly oscillators: readonly OscillatorNode[];
  /** Frequency params of the two detuned oscillators behind each of the four pad voices. */
  readonly voices: ReadonlyArray<readonly AudioParam[]>;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface ToneOptions {
  frequency: number;
  type: OscillatorType;
  /** Absolute `AudioContext` time. */
  start: number;
  duration: number;
  /** Peak gain, relative to the bus the tone plays on. */
  peak: number;
}

let settings: AudioSettings = loadSettings();
const listeners = new Set<() => void>();

let currentEngine: Engine | null = null;
let ambient: AmbientLoop | null = null;

// --- Settings -------------------------------------------------------------------------------------

export function getAudioSettings(): AudioSettings {
  return settings;
}

/** Notifies on every settings change; shaped for `useSyncExternalStore`. */
export function subscribeToAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** False where the Web Audio API is unavailable; every cue is then a silent no-op. */
export function isAudioSupported(): boolean {
  return typeof AudioContext !== 'undefined';
}

/** Global mute for sound effects and music together. */
export function toggleMute(): void {
  updateSettings({ muted: !settings.muted });
  // Muting never needs a context; unmuting happens inside a click, so this is allowed to start one.
  const engine = settings.muted ? currentEngine : ensureEngine();
  if (engine !== null) {
    engine.master.gain.setTargetAtTime(settings.muted ? 0 : 1, engine.ctx.currentTime, MUTE_RAMP_SECONDS);
  }
  syncAmbient();
}

/** Starts or stops the ambient loop. It stays silent while muted and resumes on unmute. */
export function toggleAmbientMusic(): void {
  updateSettings({ musicEnabled: !settings.musicEnabled });
  if (settings.musicEnabled && !settings.muted) {
    ensureEngine();
  }
  syncAmbient();
}

/**
 * Autoplay policy keeps a fresh `AudioContext` silent until the user interacts with the page, so after a
 * reload the ambient loop waits here for the first pointer or key event. Returns a function that disarms it.
 */
export function armOnFirstGesture(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const disarm = (): void => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  const unlock = (event: Event): void => {
    const target = event.target;
    // The Music button owns this gesture: starting here would race its click and immediately stop the loop.
    if (target instanceof Element && target.closest(AUDIO_CONTROL_SELECTOR) !== null) {
      disarm();
      return;
    }
    disarm();
    if (!settings.muted && settings.musicEnabled) {
      ensureEngine();
      syncAmbient();
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return disarm;
}

// --- Sound effects --------------------------------------------------------------------------------

/** Dice clattering across the table: a band-passed white-noise burst shaped into a few quick landings. */
export function playDiceRoll(): void {
  const engine = engineForSfx();
  if (engine === null) {
    return;
  }
  const { ctx, sfx, noise } = engine;
  const start = ctx.currentTime;

  const source = ctx.createBufferSource();
  source.buffer = noise;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(0.9, start);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(SILENCE, start);
  DICE_CLATTER_OFFSETS.forEach((offset, index) => {
    const at = start + offset;
    // Each landing is quieter and a little brighter than the last, like dice losing energy.
    const peak = 0.9 * (1 - index / (DICE_CLATTER_OFFSETS.length + 1));
    filter.frequency.setValueAtTime(2600 + index * 320, at);
    envelope.gain.setValueAtTime(peak, at);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, at + 0.045);
  });

  source.connect(filter).connect(envelope).connect(sfx);
  source.start(start);
  source.stop(start + DICE_ROLL_SECONDS);
}

/** Points safely banked: an ascending C major triad, each note ringing a little longer than the last. */
export function playHold(): void {
  const engine = engineForSfx();
  if (engine === null) {
    return;
  }
  const start = engine.ctx.currentTime;
  HOLD_TRIAD.forEach((frequency, index) => {
    tone(engine, engine.sfx, {
      frequency,
      type: 'triangle',
      start: start + index * HOLD_NOTE_SPACING_SECONDS,
      duration: 0.5 + index * 0.12,
      peak: 0.35,
    });
  });
}

/** The 6 & 6 penalty: a sawtooth buzzer with a tritone beating against the root, sliding down two octaves. */
export function playDoubleSix(): void {
  const engine = engineForSfx();
  if (engine === null) {
    return;
  }
  const { ctx, sfx } = engine;
  const start = ctx.currentTime;
  const end = start + DOUBLE_SIX_SECONDS;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, start);
  filter.frequency.exponentialRampToValueAtTime(220, end);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(SILENCE, start);
  envelope.gain.linearRampToValueAtTime(0.5, start + 0.03);
  envelope.gain.setValueAtTime(0.5, end - 0.25);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
  filter.connect(envelope).connect(sfx);

  // Root, a slightly sharp copy of it (slow beating), and the tritone above.
  const startFrequencies = [NOTE.A3, NOTE.A3 + 6, NOTE.A3 * TRITONE];
  for (const from of startFrequencies) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(from / 4, end);
    osc.connect(filter);
    osc.start(start);
    osc.stop(end + 0.05);
  }
}

/** Match won: a rising arpeggio that lands on a sustained C major chord. */
export function playWin(): void {
  const engine = engineForSfx();
  if (engine === null) {
    return;
  }
  const start = engine.ctx.currentTime;
  WIN_ARPEGGIO.forEach((frequency, index) => {
    tone(engine, engine.sfx, {
      frequency,
      type: 'triangle',
      start: start + index * WIN_NOTE_SPACING_SECONDS,
      duration: 0.3,
      peak: 0.3,
    });
  });

  const chordStart = start + WIN_ARPEGGIO.length * WIN_NOTE_SPACING_SECONDS + 0.05;
  for (const frequency of WIN_CHORD) {
    // A triangle carries the pitch; a quiet sawtooth underneath gives it a brassy edge.
    tone(engine, engine.sfx, { frequency, type: 'triangle', start: chordStart, duration: 1.5, peak: 0.25 });
    tone(engine, engine.sfx, { frequency, type: 'sawtooth', start: chordStart, duration: 1.5, peak: 0.07 });
  }
}

// --- Internals ------------------------------------------------------------------------------------

function updateSettings(patch: Partial<AudioSettings>): void {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  listeners.forEach((listener) => listener());
}

function loadSettings(): AudioSettings {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_SETTINGS;
    }
    const parsed = AudioSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(next: AudioSettings): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked (private browsing); the preference then lasts for this page only.
  }
}

/** The engine for a sound effect, or `null` when muted or unsupported so the caller plays nothing. */
function engineForSfx(): Engine | null {
  return settings.muted ? null : ensureEngine();
}

/** Creates the context on first use and resumes it if the browser suspended it. */
function ensureEngine(): Engine | null {
  if (currentEngine === null) {
    if (!isAudioSupported()) {
      return null;
    }
    currentEngine = createEngine(new AudioContext());
    syncAmbient();
  }
  if (currentEngine.ctx.state === 'suspended') {
    // Rejected outside a user gesture; the next gesture-driven call tries again.
    currentEngine.ctx.resume().catch(() => undefined);
  }
  return currentEngine;
}

function createEngine(ctx: AudioContext): Engine {
  const master = ctx.createGain();
  master.gain.value = settings.muted ? 0 : 1;
  master.connect(ctx.destination);

  const sfx = ctx.createGain();
  sfx.gain.value = SFX_LEVEL;
  sfx.connect(master);

  const music = ctx.createGain();
  music.gain.value = 0;
  music.connect(master);

  return { ctx, master, sfx, music, noise: createNoiseBuffer(ctx) };
}

/** Uniform white noise. (Math.random is fine here: this is texture, not a dice value.) */
function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** One oscillator with a fast attack and an exponential decay to silence. */
function tone({ ctx }: Engine, bus: AudioNode, { frequency, type, start, duration, peak }: ToneOptions): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(SILENCE, start);
  envelope.gain.linearRampToValueAtTime(peak, start + ATTACK_SECONDS);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, start + duration);

  osc.connect(envelope).connect(bus);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Starts or stops the ambient loop so it matches the settings. Never creates a context by itself. */
function syncAmbient(): void {
  const engine = currentEngine;
  const shouldPlay = engine !== null && settings.musicEnabled && !settings.muted;
  if (shouldPlay && ambient === null) {
    ambient = startAmbient(engine);
  } else if (!shouldPlay && ambient !== null) {
    stopAmbient(ambient);
    ambient = null;
  }
}

/**
 * A soft pad: four voices of two detuned triangles each, through a low-pass filter whose cutoff drifts
 * under a very slow LFO, plus sparse sine "sparkles" two octaves up. Chords are scheduled a loop ahead.
 */
function startAmbient(engine: Engine): AmbientLoop {
  const { ctx, music } = engine;
  const now = ctx.currentTime;
  music.gain.cancelScheduledValues(now);
  music.gain.setTargetAtTime(MUSIC_LEVEL, now, MUSIC_FADE_IN_SECONDS / 3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(520, now);
  filter.Q.setValueAtTime(0.7, now);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.07, now);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.setValueAtTime(220, now);
  lfo.connect(lfoDepth).connect(filter.frequency);

  // The pad is quieter than the sparkles that sit on top of it.
  const padBus = ctx.createGain();
  padBus.gain.setValueAtTime(0.5, now);
  filter.connect(padBus).connect(music);

  const oscillators: OscillatorNode[] = [lfo];
  const voices: AudioParam[][] = [];
  const [firstChord] = AMBIENT_PROGRESSION;
  for (const frequency of firstChord ?? []) {
    const params: AudioParam[] = [];
    for (const detune of [-AMBIENT_DETUNE_CENTS, AMBIENT_DETUNE_CENTS]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, now);
      osc.detune.setValueAtTime(detune, now);
      osc.connect(filter);
      oscillators.push(osc);
      params.push(osc.frequency);
    }
    voices.push(params);
  }
  oscillators.forEach((osc) => osc.start(now));

  const loop: AmbientLoop = { engine, oscillators, voices, timer: undefined };
  scheduleAmbientLoop(loop, now);
  return loop;
}

/** Schedules one full pass of the progression from `start`, then arms a timer to schedule the next. */
function scheduleAmbientLoop(loop: AmbientLoop, start: number): void {
  const { ctx, music } = loop.engine;
  AMBIENT_PROGRESSION.forEach((chord, chordIndex) => {
    const chordStart = start + chordIndex * AMBIENT_CHORD_SECONDS;
    chord.forEach((frequency, voiceIndex) => {
      loop.voices[voiceIndex]?.forEach((param) => param.setTargetAtTime(frequency, chordStart, AMBIENT_GLIDE_SECONDS));
    });
    AMBIENT_SPARKLE_BEATS.forEach((beat, sparkleIndex) => {
      tone(loop.engine, music, {
        frequency: sparkleNote(chord, chordIndex + sparkleIndex),
        type: 'sine',
        start: chordStart + beat,
        duration: 1.6,
        peak: 0.5,
      });
    });
  });

  const loopEnd = start + AMBIENT_LOOP_SECONDS;
  const delayMs = Math.max(0, (loopEnd - ctx.currentTime - AMBIENT_LOOKAHEAD_SECONDS) * 1000);
  loop.timer = setTimeout(() => scheduleAmbientLoop(loop, loopEnd), delayMs);
}

/** Walks the chord tones so consecutive sparkles never repeat the same pitch. */
function sparkleNote(chord: Chord, step: number): number {
  const [root, third, fifth, top] = chord;
  const tones = [third, fifth, top, root];
  return (tones[step % tones.length] ?? root) * AMBIENT_SPARKLE_OCTAVES;
}

function stopAmbient(loop: AmbientLoop): void {
  clearTimeout(loop.timer);
  const { ctx, music } = loop.engine;
  const now = ctx.currentTime;
  music.gain.cancelScheduledValues(now);
  music.gain.setTargetAtTime(0, now, MUSIC_FADE_OUT_SECONDS / 3);
  loop.oscillators.forEach((osc) => osc.stop(now + MUSIC_FADE_OUT_SECONDS));
}
