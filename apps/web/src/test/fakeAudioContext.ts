import { vi, type Mock } from 'vitest';

/**
 * Just enough of the Web Audio API for the sound engine to run under happy-dom, which has none.
 * Records every node created so tests can assert on the graph without producing any sound.
 */

type ParamScheduler = Mock<(value: number, time: number) => void>;
type Starter = Mock<(time?: number) => void>;

export class FakeAudioParam {
  value = 0;
  setValueAtTime: ParamScheduler = vi.fn();
  linearRampToValueAtTime: ParamScheduler = vi.fn();
  exponentialRampToValueAtTime: ParamScheduler = vi.fn();
  setTargetAtTime: Mock<(value: number, time: number, timeConstant: number) => void> = vi.fn();
  cancelScheduledValues: Mock<(time: number) => void> = vi.fn();

  /** The first value scheduled on this param, or `undefined` if nothing was scheduled. */
  firstScheduledValue(): number | undefined {
    return this.setValueAtTime.mock.calls[0]?.[0];
  }
}

export class FakeAudioNode {
  connect: Mock<(destination: unknown) => unknown> = vi.fn((destination: unknown) => destination);
  disconnect: Mock<() => void> = vi.fn();
}

export class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

export class FakeOscillatorNode extends FakeAudioNode {
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  start: Starter = vi.fn();
  stop: Starter = vi.fn();
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  start: Starter = vi.fn();
  stop: Starter = vi.fn();
}

export class FakeAudioBuffer {
  private readonly samples: Float32Array;

  constructor(readonly length: number) {
    this.samples = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.samples;
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: AudioContextState = 'suspended';
  currentTime = 0;
  readonly sampleRate = 48_000;
  readonly destination = new FakeAudioNode();

  readonly gains: FakeGainNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume: Mock<() => Promise<void>> = vi.fn(async (): Promise<void> => {
    this.state = 'running';
  });

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createBuffer(_channels: number, length: number): FakeAudioBuffer {
    return new FakeAudioBuffer(length);
  }
}

/** Installs the fake as the global `AudioContext`; pair with `vi.unstubAllGlobals()`. */
export function installFakeAudioContext(): void {
  FakeAudioContext.instances = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
}

/** The single context the engine is expected to have created. */
export function onlyAudioContext(): FakeAudioContext {
  const [context, ...rest] = FakeAudioContext.instances;
  if (context === undefined || rest.length > 0) {
    throw new Error(`Expected exactly one AudioContext, found ${FakeAudioContext.instances.length}`);
  }
  return context;
}

/** The ambient pad's oscillators: the only ones the engine detunes. */
export function padOscillators(context: FakeAudioContext): FakeOscillatorNode[] {
  return context.oscillators.filter((osc) => osc.detune.setValueAtTime.mock.calls.length > 0);
}

/** Lowest pitch that counts as a note; the ambient filter LFO is a sine far below it. */
const LOWEST_AUDIBLE_HZ = 20;

/** The ambient loop's high sine "sparkles". */
export function sparkleOscillators(context: FakeAudioContext): FakeOscillatorNode[] {
  return context.oscillators.filter(
    (osc) => osc.type === 'sine' && (osc.frequency.firstScheduledValue() ?? 0) >= LOWEST_AUDIBLE_HZ,
  );
}
