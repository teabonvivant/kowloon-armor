export class Soundtrack {
  private nextBeat = 0;
  private beat = 0;
  private voices = 0;
  private intensity = 0;
  private volume = .35;
  private readonly gain: GainNode;
  constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.gain = context.createGain(); this.gain.gain.value = 0; this.gain.connect(destination);
  }
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
