import { spatialMix } from './spatial-audio';
import { wallFraction } from './math';
import type { Obstacle } from './render/world';
import { Soundtrack } from './soundtrack';
import { cannonSound, impactSound } from './effect-audio';
import type { SoundProfile } from './effect-audio';
import type { ImpactKind } from './effect-math';

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
  private output: GainNode | null = null;
  private night = false;
  private battleGain: GainNode | null = null;
  private effectsVolume = 1; private engineVolume = 1; private alertsVolume = 1;
  private readonly active = new Set<AudioScheduledSourceNode>();
  private trackSource: AudioBufferSourceNode | null = null;
  private disposed = false;
  private fieldActive = false;
  private events = 0; private cancelled = 0;

  unlock(): void {
    if (this.disposed) return;
    if (typeof AudioContext !== 'function') return;
    if (this.context === null) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      const limiter = this.context.createDynamicsCompressor(); this.limiter = limiter;
      limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 8;
      limiter.attack.value = .003; limiter.release.value = .18;
      this.output = this.context.createGain();
      this.master.connect(limiter).connect(this.output).connect(this.context.destination);
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
      damping.connect(tail).connect(decay).connect(this.battleGain);
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
      track.buffer = buffer; track.loop = true; this.trackSource = track;
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
      this.output?.gain.setTargetAtTime(enabled ? .55 : 1, this.context.currentTime, .05);
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
    if (!this.fieldActive) { this.field?.gain.setTargetAtTime(1, now, .025); this.fieldActive = true; }
    this.engineOscillator.frequency.setTargetAtTime(34 + power * 48, now, 0.16);
    this.engineGain.gain.setTargetAtTime((0.035 + power * 0.065) * this.engineVolume, now, 0.16);
    this.trackGain?.gain.setTargetAtTime(power * .5 * this.engineVolume, now, .12);
    this.trackFilter?.frequency.setTargetAtTime(240 + power * 1100, now, .12);
  }

  listen(position: { readonly x: number; readonly z: number }, yaw: number, obstacles: readonly Obstacle[] = []): void {
    this.listener.x = position.x; this.listener.z = position.z; this.listenerYaw = yaw;
    this.obstacles = obstacles;
  }
  private mixAt(position: { readonly x: number; readonly z: number }): ReturnType<typeof spatialMix> {
    const mix = spatialMix(this.listener, this.listenerYaw, position);
    const occluded = wallFraction(this.listener.x, this.listener.z, position.x - this.listener.x, position.z - this.listener.z, this.obstacles) < 1;
    if (occluded) { mix.gain *= .5; mix.cutoff *= .4; }
    return mix;
  }
  fire(position = this.listener, calibre = 120, own = false): void {
    const distance = Math.hypot(position.x - this.listener.x, position.z - this.listener.z);
    const mix = own ? { pan: 0, gain: 1, cutoff: 6500 } : this.mixAt(position);
    this.burst(cannonSound(calibre), mix, own ? 0 : Math.min(.8, distance / 343), own || distance < 1);
  }
  impact(position: { readonly x: number; readonly z: number }, destroyed: boolean, kind: ImpactKind = 'armor', calibre = 120): void {
    const profile = impactSound(kind, destroyed); profile.volume *= Math.sqrt(Math.max(90, Math.min(155, calibre)) / 120);
    this.burst(profile, this.mixAt(position), Math.min(.8, Math.hypot(position.x - this.listener.x, position.z - this.listener.z) / 343));
  }
  hit(track = false): void { this.burst(impactSound(track ? 'track' : 'armor', false)); }
  ready(): void { this.tone(720, .07, .1); this.tone(960, .09, .08, .1); }

  private tone(frequency: number, duration: number, volume: number, delay = 0): void {
    if (!this.context || !this.master || this.context.state !== 'running' || this.voices >= 16) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    const time = this.context.currentTime + delay;
    oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume * this.alertsVolume, time);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    oscillator.connect(gain).connect(this.master); this.register(oscillator, [gain]);
    oscillator.start(time); oscillator.stop(time + duration);
  }

  private register(source: AudioScheduledSourceNode, nodes: AudioNode[], release?: () => void): void {
    this.active.add(source); this.voices = this.active.size;
    source.onended = () => { source.disconnect(); for (const node of nodes) node.disconnect(); this.active.delete(source); this.voices = this.active.size; release?.(); };
  }
  private burst(profile: SoundProfile, mix = { pan: 0, gain: 1, cutoff: 6500 }, delay = 0, mechanical = false): void {
    const count = mechanical ? 4 : 3;
    if (!this.context || !this.master || !this.noise || this.context.state !== 'running' || this.voices + count > 24 || this.effectsVolume === 0) return;
    const { frequency, duration, volume } = profile;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const boomGain = this.context.createGain();
    const panner = this.context.createStereoPanner(), filter = this.context.createBiquadFilter();
    panner.pan.value = mix.pan; filter.type = 'lowpass'; filter.frequency.value = Math.min(mix.cutoff, profile.cutoff);
    filter.connect(panner).connect(this.battleGain ?? this.field ?? this.master);
    if (this.echo) panner.connect(this.echo);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(24, now + duration);
    boomGain.gain.setValueAtTime(.0001, now); boomGain.gain.linearRampToValueAtTime(volume * mix.gain, now + .004);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(boomGain).connect(filter);
    oscillator.start(now); oscillator.stop(now + duration);
    let remaining = count;
    const release = (): void => { if (--remaining === 0) { filter.disconnect(); panner.disconnect(); } };
    this.register(oscillator, [boomGain], release);
    const noiseLayer = (offset: number, length: number, level: number, frequency: number): void => {
      if (!this.context) return;
      const source = this.context.createBufferSource(), gain = this.context.createGain(), band = this.context.createBiquadFilter();
      source.buffer = this.noise; band.type = 'bandpass'; band.frequency.value = frequency; band.Q.value = .6;
      const start = now + offset;
      gain.gain.setValueAtTime(.0001, start); gain.gain.linearRampToValueAtTime(level * mix.gain, start + .002);
      gain.gain.exponentialRampToValueAtTime(.0001, start + length);
      source.connect(band).connect(gain).connect(filter); this.register(source, [gain, band], release);
      source.start(start); source.stop(start + length);
    };
    noiseLayer(0, .085, profile.crack, 2400);
    noiseLayer(.09, Math.min(.58, duration * .7), profile.tail, 480);
    if (mechanical) noiseLayer(.065, .13, .07, 1100);
    this.events++;
  }

  idle(): void { if (this.fieldActive) this.stop(); }
  stop(): void {
    if (this.context && this.active.size) {
      for (const source of this.active) { source.stop(this.context.currentTime); this.cancelled++; }
      this.active.clear(); this.voices = 0;
    }
    if (this.context && this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
    if (this.context && this.field && this.fieldActive) this.field.gain.setTargetAtTime(0, this.context.currentTime, .015);
    this.fieldActive = false;
    this.soundtrack?.stop();
  }
  stats(): { voices: number; maxVoices: number; events: number; cancelled: number; disposed: boolean } {
    return { voices: this.voices, maxVoices: 24, events: this.events, cancelled: this.cancelled, disposed: this.disposed };
  }
  dispose(): void {
    if (this.disposed) return; this.stop(); this.disposed = true;
    this.engineOscillator?.stop(); this.engineOscillator?.disconnect(); this.trackSource?.stop(); this.trackSource?.disconnect();
    this.master?.disconnect(); this.output?.disconnect(); this.field?.disconnect(); this.echo?.disconnect(); this.battleGain?.disconnect();
    if (this.context && typeof this.context.close === 'function') void this.context.close();
    this.noise = null; this.context = null;
  }
}
