import { spatialMix } from './spatial-audio';

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private volume = 0.35;
  private failureReported = false;
  private readonly listener = { x: 0, z: 0 };
  private listenerYaw = 0;
  private noise: AudioBuffer | null = null;
  private voices = 0;

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
      this.noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * .6), this.context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / (samples.length * .13));
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

  listen(position: { readonly x: number; readonly z: number }, yaw: number): void {
    this.listener.x = position.x; this.listener.z = position.z; this.listenerYaw = yaw;
  }
  fire(position = this.listener): void { this.burst(.48, 76, .7, spatialMix(this.listener, this.listenerYaw, position)); }
  hit(track = false): void { this.burst(.16, track ? 280 : 150, .2); }
  ready(): void { this.tone(720, .07, .1); this.tone(960, .09, .08, .1); }

  private tone(frequency: number, duration: number, volume: number, delay = 0): void {
    if (!this.context || !this.master || this.context.state !== 'running' || this.voices >= 16) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    const time = this.context.currentTime + delay;
    oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    oscillator.connect(gain).connect(this.master); this.voices++;
    oscillator.start(time); oscillator.stop(time + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices--; };
  }

  private burst(duration: number, frequency: number, volume: number, mix = { pan: 0, gain: 1, cutoff: 6500 }): void {
    if (!this.context || !this.master || !this.noise || this.context.state !== 'running' || this.voices >= 14) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const boomGain = this.context.createGain();
    const panner = this.context.createStereoPanner(), filter = this.context.createBiquadFilter();
    panner.pan.value = mix.pan; filter.type = 'lowpass'; filter.frequency.value = mix.cutoff;
    filter.connect(panner).connect(this.master);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(24, now + duration);
    boomGain.gain.setValueAtTime(volume * mix.gain, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(boomGain).connect(filter); this.voices += 2;
    oscillator.start(now); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); boomGain.disconnect(); this.voices--; };
    const crack = this.context.createBufferSource();
    const crackGain = this.context.createGain();
    crack.buffer = this.noise; crackGain.gain.value = volume * .45 * mix.gain;
    crack.connect(crackGain).connect(filter); crack.start(now); crack.stop(now + .6);
    crack.onended = () => { crack.disconnect(); crackGain.disconnect(); filter.disconnect(); panner.disconnect(); this.voices--; };
  }

  stop(): void {
    if (this.context && this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
  }
}
