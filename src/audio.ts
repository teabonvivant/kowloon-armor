export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private volume = 0.35;
  private failureReported = false;

  unlock(): void {
    if (typeof AudioContext !== 'function') return;
    if (this.context === null) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
      const oscillator = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      this.engineGain = this.context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 34;
      filter.type = 'lowpass';
      filter.frequency.value = 140;
      this.engineGain.gain.value = 0;
      oscillator.connect(filter).connect(this.engineGain).connect(this.master);
      oscillator.start();
      this.engineOscillator = oscillator;
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().catch((error: unknown) => {
        if (error instanceof DOMException) {
          if (!this.failureReported) console.warn('瀏覽器未啟用遊戲音效；下次點擊後會再嘗試。');
          this.failureReported = true;
          return;
        }
        throw error;
      });
    }
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.05);
  }

  engine(speed: number): void {
    if (!this.context || !this.engineOscillator || !this.engineGain) return;
    const power = Math.min(1, Math.abs(Number.isFinite(speed) ? speed : 0) / 20);
    const now = this.context.currentTime;
    this.engineOscillator.frequency.setTargetAtTime(34 + power * 48, now, 0.16);
    this.engineGain.gain.setTargetAtTime(0.035 + power * 0.065, now, 0.16);
  }

  fire(): void { this.burst(0.48, 76, 0.7); }
  hit(): void { this.burst(0.19, 150, 0.32); }

  private burst(duration: number, frequency: number, volume: number): void {
    if (!this.context || !this.master || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const boomGain = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(24, now + duration);
    boomGain.gain.setValueAtTime(volume, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(boomGain).connect(this.master);
    oscillator.start(now); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); boomGain.disconnect(); };
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / (samples.length * 0.11));
    const crack = this.context.createBufferSource();
    const crackGain = this.context.createGain();
    crack.buffer = buffer; crackGain.gain.value = volume * 0.45;
    crack.connect(crackGain).connect(this.master); crack.start(now);
    crack.onended = () => { crack.disconnect(); crackGain.disconnect(); };
  }

  stop(): void {
    if (this.context && this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
  }
}
