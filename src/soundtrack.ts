/** Bus ducker: gain node in series plus a JS-side model of the envelope so overlapping ducks continue smoothly. */
export class Duck {
  readonly node: GainNode;
  private t0 = 0; private v0 = 1; private t1 = 0; private v1 = 1; private t2 = 0; private t3 = 0;
  constructor(private readonly context: BaseAudioContext, destination: AudioNode) {
    this.node = context.createGain(); this.node.gain.value = 1; this.node.connect(destination);
  }
  /** Modelled linear gain at time t (1 = untouched). */
  valueAt(t: number): number {
    if (t <= this.t0) return this.v0 === 1 ? 1 : this.v0;
    if (t < this.t1) return this.v0 + (this.v1 - this.v0) * (t - this.t0) / Math.max(1e-6, this.t1 - this.t0);
    if (t < this.t2) return this.v1;
    if (t < this.t3) return this.v1 + (1 - this.v1) * (t - this.t2) / Math.max(1e-6, this.t3 - this.t2);
    return 1;
  }
  /** Pull the bus down by depthDb within `attack`, hold, then glide back. */
  apply(depthDb: number, at = this.context.currentTime, attack = .03, hold = .3, release = .75): void {
    if (!(depthDb > 0)) return;
    const start = Math.max(at, this.context.currentTime), from = this.valueAt(start);
    const target = Math.min(from, Math.pow(10, -depthDb / 20));
    const param = this.node.gain;
    param.cancelScheduledValues(start); param.setValueAtTime(from, start);
    param.linearRampToValueAtTime(target, start + attack);
    param.setValueAtTime(target, start + attack + hold);
    param.linearRampToValueAtTime(1, start + attack + hold + release);
    this.t0 = start; this.v0 = from; this.t1 = start + attack; this.v1 = target; this.t2 = start + attack + hold; this.t3 = start + attack + hold + release;
  }
}
export class Soundtrack {
  private nextBeat = 0;
  private beat = 0;
  private voices = 0;
  private intensity = 0;
  private volume = .35;
  private readonly gain: GainNode;
  private readonly ducker: Duck;
  constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.ducker = new Duck(context, destination);
    this.gain = context.createGain(); this.gain.gain.value = 0; this.gain.connect(this.ducker.node);
  }
  /** v1.9: temporary level reduction of the music bus (explosion ducking). */
  duck(depthDb: number, at?: number): void { this.ducker.apply(depthDb, at); }
  /** Current modelled duck gain (diagnostics/tests). */
  duckGain(at = this.context.currentTime): number { return this.ducker.valueAt(at); }
  get duckNode(): GainNode { return this.ducker.node; }
  setVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); }
  update(threat: number, dt: number): void {
    this.intensity += (Math.max(0, Math.min(1, threat)) - this.intensity) * Math.min(1, dt * 1.5);
    const now = this.context.currentTime;
    this.gain.gain.setTargetAtTime(this.volume * .32, now, .2);
    if (this.nextBeat < now - .2) this.nextBeat = now;
    while (this.nextBeat < now + .1) {
      const beat = this.beat++ % 64, time = this.nextBeat;
      const root = [73.416, 65.406, 58.27, 65.406][Math.floor(beat / 16)] ?? 73.416;
      if (beat % 4 === 0) this.note(root, time, 1.1, .2, 'triangle');
      if (beat % 4 === 2) this.note(root * 1.5, time, .4, .08, 'sine');
      if (beat % 8 === 0) {
        const interval = [4, 4.5, 5, 6, 5, 4.5, 3, 4][Math.floor(beat / 8)] ?? 4;
        this.note(root * interval, time, 1.4, .09, 'sine');
        this.note(root * interval * 2.002, time, .6, .025, 'sine');
      }
      if (this.intensity > .25 && beat % 2 === 0) this.note(90, time, .14, .25 * this.intensity, 'sine', 34);
      if (this.intensity > .55 && beat % 4 === 3) this.note(root * 2, time, .12, .1, 'triangle');
      this.nextBeat += .3125;
    }
  }
  stop(): void {
    this.gain.gain.setTargetAtTime(0, this.context.currentTime, .03);
    this.nextBeat = this.context.currentTime; this.intensity = 0;
  }
  private note(frequency: number, time: number, duration: number, volume: number, type: OscillatorType, end?: number): void {
    if (this.voices >= 12) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
    if (end) oscillator.frequency.exponentialRampToValueAtTime(end, time + duration);
    gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(volume, time + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain).connect(this.gain); this.voices++;
    oscillator.start(time); oscillator.stop(time + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices--; };
  }
}
