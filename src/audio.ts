import { spatialMix } from './spatial-audio';
import { wallFraction } from './math';
import type { Obstacle } from './render/world';
import { Soundtrack } from './soundtrack';

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
  private soundtrack: Soundtrack | null = null;
  private musicVolume = .35;
  private field: GainNode | null = null;
  private trackGain: GainNode | null = null;
  private trackFilter: BiquadFilterNode | null = null;
  private obstacles: readonly Obstacle[] = [];
  private echo: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private night = false;
  private battleGain: GainNode | null = null;
  private effectsVolume = 1; private engineVolume = 1; private alertsVolume = 1;

  unlock(): void {
    if (typeof AudioContext !== 'function') return;
    if (this.context === null) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      const limiter = this.context.createDynamicsCompressor(); this.limiter = limiter;
      limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 8;
      limiter.attack.value = .003; limiter.release.value = .18;
      this.master.connect(limiter).connect(this.context.destination);
      this.setNightMode(this.night);
      this.field = this.context.createGain(); this.field.gain.value = 0; this.field.connect(this.master);
      this.battleGain = this.context.createGain(); this.battleGain.gain.value = this.effectsVolume; this.battleGain.connect(this.field);
      this.soundtrack = new Soundtrack(this.context, this.master); this.soundtrack.setVolume(this.musicVolume);
      this.echo = this.context.createGain(); this.echo.gain.value = .2;
      const delay = this.context.createDelay(.5), tail = this.context.createDelay(.5);
      const damping = this.context.createBiquadFilter(), decay = this.context.createGain();
      delay.delayTime.value = .13; tail.delayTime.value = .21; decay.gain.value = .28;
      damping.type = 'lowpass'; damping.frequency.value = 1600;
      this.echo.connect(delay).connect(damping).connect(this.battleGain);
      damping.connect(tail).connect(decay).connect(delay);
      const oscillator = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      this.engineGain = this.context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 34;
      filter.type = 'lowpass';
      filter.frequency.value = 140;
      this.engineGain.gain.value = 0;
      oscillator.connect(filter).connect(this.engineGain).connect(this.field);
      oscillator.start();
      this.engineOscillator = oscillator;
      this.noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * .6), this.context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / (samples.length * .13));
      const track = this.context.createBufferSource(), buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const trackSamples = buffer.getChannelData(0);
      let smooth = 0;
      for (let index = 0; index < trackSamples.length; index++) {
        smooth = (smooth + (Math.random() * 2 - 1) * .08) / 1.08;
        trackSamples[index] = smooth * (0.5 + .5 * Math.sin(index / this.context.sampleRate * Math.PI * 36));
      }
      track.buffer = buffer; track.loop = true;
      this.trackGain = this.context.createGain(); this.trackGain.gain.value = 0;
      this.trackFilter = this.context.createBiquadFilter(); this.trackFilter.type = 'bandpass'; this.trackFilter.frequency.value = 380;
      track.connect(this.trackFilter).connect(this.trackGain).connect(this.field); track.start();
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
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume * (this.night ? .65 : 1), this.context.currentTime, 0.05);
  }

  setNightMode(enabled: boolean): void {
    this.night = enabled;
    if (this.context && this.limiter) {
      this.limiter.threshold.setTargetAtTime(enabled ? -24 : -10, this.context.currentTime, .05);
      this.limiter.ratio.setTargetAtTime(enabled ? 12 : 8, this.context.currentTime, .05);
    }
    this.setVolume(this.volume);
  }

  setMusicVolume(value: number): void {
    this.musicVolume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    this.soundtrack?.setVolume(this.musicVolume);
  }
  setMix(effects: number, engine: number, alerts: number): void {
    const level = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    this.effectsVolume = level(effects); this.engineVolume = level(engine); this.alertsVolume = level(alerts);
    if (this.context && this.battleGain) this.battleGain.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, .05);
  }

  atmosphere(threat: number, dt: number): void { this.soundtrack?.update(threat, dt); }

  engine(speed: number): void {
    if (!this.context || !this.engineOscillator || !this.engineGain) return;
    const power = Math.min(1, Math.abs(Number.isFinite(speed) ? speed : 0) / 20);
    const now = this.context.currentTime;
    this.field?.gain.setTargetAtTime(1, now, .025);
    this.engineOscillator.frequency.setTargetAtTime(34 + power * 48, now, 0.16);
    this.engineGain.gain.setTargetAtTime((0.035 + power * 0.065) * this.engineVolume, now, 0.16);
    this.trackGain?.gain.setTargetAtTime(power * .5 * this.engineVolume, now, .12);
    this.trackFilter?.frequency.setTargetAtTime(240 + power * 1100, now, .12);
  }

  listen(position: { readonly x: number; readonly z: number }, yaw: number, obstacles: readonly Obstacle[] = []): void {
    this.listener.x = position.x; this.listener.z = position.z; this.listenerYaw = yaw;
    this.obstacles = obstacles;
  }
  fire(position = this.listener): void {
    const mix = spatialMix(this.listener, this.listenerYaw, position);
    const distance = Math.hypot(position.x - this.listener.x, position.z - this.listener.z);
    const occluded = wallFraction(this.listener.x, this.listener.z, position.x - this.listener.x, position.z - this.listener.z, this.obstacles) < 1;
    if (occluded) { mix.gain *= .5; mix.cutoff *= .4; }
    this.burst(.8, 96, .68, mix, Math.min(.7, distance / 343));
  }
  impact(position: { readonly x: number; readonly z: number }, destroyed: boolean): void {
    this.burst(destroyed ? 1.2 : .22, destroyed ? 65 : 210, destroyed ? .6 : .22, spatialMix(this.listener, this.listenerYaw, position));
  }
  hit(track = false): void { this.burst(.16, track ? 280 : 150, .2); }
  ready(): void { this.tone(720, .07, .1); this.tone(960, .09, .08, .1); }

  private tone(frequency: number, duration: number, volume: number, delay = 0): void {
    if (!this.context || !this.master || this.context.state !== 'running' || this.voices >= 16) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    const time = this.context.currentTime + delay;
    oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume * this.alertsVolume, time);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    oscillator.connect(gain).connect(this.master); this.voices++;
    oscillator.start(time); oscillator.stop(time + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices--; };
  }

  private burst(duration: number, frequency: number, volume: number, mix = { pan: 0, gain: 1, cutoff: 6500 }, delay = 0): void {
    if (!this.context || !this.master || !this.noise || this.context.state !== 'running' || this.voices >= 14) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const boomGain = this.context.createGain();
    const panner = this.context.createStereoPanner(), filter = this.context.createBiquadFilter();
    panner.pan.value = mix.pan; filter.type = 'lowpass'; filter.frequency.value = mix.cutoff;
    filter.connect(panner).connect(this.battleGain ?? this.field ?? this.master);
    if (this.echo) panner.connect(this.echo);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(24, now + duration);
    boomGain.gain.setValueAtTime(volume * mix.gain, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(boomGain).connect(filter); this.voices += 2;
    oscillator.start(now); oscillator.stop(now + duration);
    let remaining = 2;
    const release = (): void => { this.voices--; if (--remaining === 0) { filter.disconnect(); panner.disconnect(); } };
    oscillator.onended = () => { oscillator.disconnect(); boomGain.disconnect(); release(); };
    const crack = this.context.createBufferSource();
    const crackGain = this.context.createGain();
    crack.buffer = this.noise; crackGain.gain.value = volume * .45 * mix.gain;
    crack.connect(crackGain).connect(filter); crack.start(now); crack.stop(now + .6);
    crack.onended = () => { crack.disconnect(); crackGain.disconnect(); release(); };
  }

  stop(): void {
    if (this.context && this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
    if (this.context && this.field) this.field.gain.setTargetAtTime(0, this.context.currentTime, .03);
    this.soundtrack?.stop();
  }
}
