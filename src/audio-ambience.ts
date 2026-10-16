import { Duck } from './soundtrack';

/** What the integrator may feed in each frame; every field is optional (silence-safe defaults). */
export interface AmbienceInfo {
  /** 0..1 proximity to a large neon sign (strengthens 50/100 Hz hum and occasional pops). */
  neon?: number;
  /** 0..1 proximity to air-conditioner blocks (strengthens 100 Hz + 3rd harmonic). */
  cooling?: number;
  /** Nearest enemy position (world x/z). Distant gunfire is placed in this direction. */
  enemy?: { readonly x: number; readonly z: number } | null;
}
export interface AmbienceHost {
  readonly context: AudioContext;
  /** Effects bus the ambience lives on (so the effects volume applies). */
  readonly destination: AudioNode;
  readonly noise: AudioBuffer;
  voices(): number;
  register(source: AudioScheduledSourceNode, nodes: AudioNode[], release?: () => void): void;
  mixAt(position: { readonly x: number; readonly z: number }): { pan: number; gain: number; cutoff: number };
  listener(): { readonly x: number; readonly z: number };
}
/** Persistent node count of the ambience layer (AC-AUD-6: at most 12). */
export const AMBIENCE_NODES = 8;

/**
 * Loopable street bed (traffic rumble, 120-400 Hz). The head is cross-faded with the tail so the wrap-around
 * sample step equals an ordinary sample step of the low-passed noise.
 */
export function ambienceLoop(sampleRate: number, seconds = 4, seed = 20261016): Float32Array {
  const length = Math.floor(sampleRate * seconds), fade = Math.floor(sampleRate * .4), total = length + fade;
  let state = seed >>> 0;
  const random = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2147483648 - 1; };
  const raw = new Float32Array(total);
  let low1 = 0, low2 = 0, high = 0;
  const lowA = 1 - Math.exp(-2 * Math.PI * 400 / sampleRate), highA = 1 - Math.exp(-2 * Math.PI * 120 / sampleRate);
  for (let index = 0; index < total; index++) {
    low1 += (random() - low1) * lowA; low2 += (low1 - low2) * lowA; high += (low2 - high) * highA;
    raw[index] = low2 - high;
  }
  const out = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    if (index < fade) { const w = index / fade, a = Math.sin(w * Math.PI / 2), b = Math.cos(w * Math.PI / 2); out[index] = (raw[index] ?? 0) * a + (raw[length + index] ?? 0) * b; }
    else out[index] = raw[index] ?? 0;
  }
  let peak = 0; for (const value of out) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let index = 0; index < length; index++) out[index] = (out[index] ?? 0) / peak * .5;
  return out;
}

/** Street / air-conditioner / neon beds plus occasional distant horn and gunfire. All procedural, 8 persistent nodes. */
export class Ambience {
  private readonly duckBus: Duck;
  private readonly street: AudioBufferSourceNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly streetGain: GainNode;
  private readonly cooling: OscillatorNode; private readonly coolingGain: GainNode;
  private readonly neon: OscillatorNode; private readonly neonGain: GainNode;
  private night = false; private active = false;
  private clock = 0; private nextHorn = 14; private nextGun = 9; private nextPop = 4; private nextDrift = 0; private drift = 1;
  private state = 90210;
  constructor(private readonly host: AmbienceHost) {
    const context = host.context;
    this.duckBus = new Duck(context, host.destination);
    const rate = context.sampleRate, loop = ambienceLoop(rate);
    const buffer = context.createBuffer(1, loop.length, rate); buffer.copyToChannel(loop as Float32Array<ArrayBuffer>, 0);
    this.street = context.createBufferSource(); this.street.buffer = buffer; this.street.loop = true;
    this.lowpass = context.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.frequency.value = 380;
    this.streetGain = context.createGain(); this.streetGain.gain.value = 0;
    this.street.connect(this.lowpass).connect(this.streetGain).connect(this.duckBus.node);
    const wave = (harmonics: number[]): PeriodicWave => {
      const real = new Float32Array(harmonics.length + 1), imag = new Float32Array(harmonics.length + 1);
      harmonics.forEach((amplitude, index) => { imag[index + 1] = amplitude; });
      return context.createPeriodicWave(real, imag);
    };
    this.cooling = context.createOscillator(); this.cooling.setPeriodicWave(wave([1, 0, .5]));
    this.coolingGain = context.createGain(); this.coolingGain.gain.value = 0;
    this.cooling.frequency.value = 100; this.cooling.connect(this.coolingGain).connect(this.duckBus.node);
    this.neon = context.createOscillator(); this.neon.setPeriodicWave(wave([1, .55]));
    this.neonGain = context.createGain(); this.neonGain.gain.value = 0;
    this.neon.frequency.value = 50; this.neon.connect(this.neonGain).connect(this.duckBus.node);
    this.street.start(); this.cooling.start(); this.neon.start();
  }
  setNight(night: boolean): void { this.night = night; }
  duck(depthDb: number, at?: number): void { this.duckBus.apply(depthDb, at); }
  duckGain(at?: number): number { return this.duckBus.valueAt(at ?? this.host.context.currentTime); }
  get duckNode(): GainNode { return this.duckBus.node; }
  private random(): number { this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0; return this.state / 4294967296; }

  update(dt: number, info: AmbienceInfo = {}): void {
    const context = this.host.context, now = context.currentTime;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(1, dt)) : 0;
    this.clock += step; this.active = true;
    const trim = this.night ? .35 : 1;
    const neon = Math.max(0, Math.min(1, info.neon ?? 0)), cooling = Math.max(0, Math.min(1, info.cooling ?? 0));
    if (this.clock >= this.nextDrift) { this.nextDrift = this.clock + 1.5 + this.random() * 2; this.drift = .82 + this.random() * .36; }
    this.streetGain.gain.setTargetAtTime(.13 * this.drift * trim, now, .6);
    this.lowpass.frequency.setTargetAtTime(240 + 160 * this.drift, now, .8);
    this.coolingGain.gain.setTargetAtTime((.002 + .006 * cooling) * trim, now, .6);
    this.neonGain.gain.setTargetAtTime(.0018 * neon * trim, now, .4);
    if (this.host.voices() > 16) return;
    if (this.clock >= this.nextHorn) { this.nextHorn = this.clock + 22 + this.random() * 28; this.horn(trim); }
    if (info.enemy && this.clock >= this.nextGun) { this.nextGun = this.clock + 12 + this.random() * 16; this.gun(info.enemy, trim); }
    if (neon > .3 && this.clock >= this.nextPop) { this.nextPop = this.clock + 3 + this.random() * 6; this.pop(trim * neon); }
  }
  /** Silence everything immediately (pause, garage, mute). Transient voices are cancelled by the host. */
  stop(): void {
    this.active = false;
    const now = this.host.context.currentTime;
    this.streetGain.gain.setTargetAtTime(0, now, .03); this.coolingGain.gain.setTargetAtTime(0, now, .03); this.neonGain.gain.setTargetAtTime(0, now, .03);
  }
  get running(): boolean { return this.active; }
  dispose(): void {
    for (const node of [this.street, this.cooling, this.neon]) { try { node.stop(); } catch { /* already stopped */ } node.disconnect(); }
    for (const node of [this.lowpass, this.streetGain, this.coolingGain, this.neonGain, this.duckBus.node]) node.disconnect();
  }

  private transient(build: (context: AudioContext, filter: BiquadFilterNode, pan: StereoPannerNode, time: number) => AudioScheduledSourceNode[], pan: number, cutoff: number, delay: number): void {
    const context = this.host.context, filter = context.createBiquadFilter(), panner = context.createStereoPanner();
    filter.type = 'lowpass'; filter.frequency.value = cutoff; panner.pan.value = Math.max(-1, Math.min(1, pan));
    filter.connect(panner).connect(this.duckBus.node);
    const sources = build(context, filter, panner, context.currentTime + delay);
    let remaining = sources.length;
    const release = (): void => { if (--remaining === 0) { filter.disconnect(); panner.disconnect(); } };
    for (const source of sources) this.host.register(source, [], release);
  }
  private horn(trim: number): void {
    const angle = this.random() * Math.PI * 2, distance = 90 + this.random() * 80, listener = this.host.listener();
    const position = { x: listener.x + Math.cos(angle) * distance, z: listener.z + Math.sin(angle) * distance };
    const mix = this.host.mixAt(position), level = .06 * trim * (.6 + mix.gain);
    this.transient((context, filter, _pan, time) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(392, time); oscillator.frequency.setValueAtTime(494, time + .16);
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(level, time + .02);
      gain.gain.setValueAtTime(level, time + .38); gain.gain.exponentialRampToValueAtTime(.0001, time + .5);
      oscillator.connect(gain).connect(filter); oscillator.start(time); oscillator.stop(time + .52);
      return [oscillator];
    }, mix.pan, Math.min(1500, mix.cutoff), 0);
  }
  private gun(enemy: { readonly x: number; readonly z: number }, trim: number): void {
    const listener = this.host.listener(), distance = Math.hypot(enemy.x - listener.x, enemy.z - listener.z);
    const mix = this.host.mixAt(enemy), level = .09 * trim * Math.max(.35, mix.gain), delay = Math.min(.8, distance / 343);
    this.transient((context, filter, _pan, time) => {
      const noise = context.createBufferSource(), lowpass = context.createBiquadFilter(), gain = context.createGain();
      noise.buffer = this.host.noise; lowpass.type = 'lowpass'; lowpass.frequency.value = 300;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(level, time + .01); gain.gain.exponentialRampToValueAtTime(.0001, time + .7);
      noise.connect(lowpass).connect(gain).connect(filter); noise.start(time); noise.stop(time + .72);
      const thump = context.createOscillator(), thumpGain = context.createGain();
      thump.frequency.setValueAtTime(70, time); thump.frequency.exponentialRampToValueAtTime(36, time + .4);
      thumpGain.gain.setValueAtTime(0, time); thumpGain.gain.linearRampToValueAtTime(level * .9, time + .01); thumpGain.gain.exponentialRampToValueAtTime(.0001, time + .45);
      thump.connect(thumpGain).connect(filter); thump.start(time); thump.stop(time + .47);
      return [noise, thump];
    }, mix.pan, Math.min(900, mix.cutoff), delay);
  }
  private pop(strength: number): void {
    const level = .05 * Math.min(1, strength);
    this.transient((context, filter, _pan, time) => {
      const noise = context.createBufferSource(), gain = context.createGain();
      noise.buffer = this.host.noise; gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(level, time + .001);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .03);
      noise.connect(gain).connect(filter); noise.start(time); noise.stop(time + .04);
      return [noise];
    }, (this.random() - .5) * .6, 4200, 0);
  }
}
