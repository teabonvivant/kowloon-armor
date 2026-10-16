import { spatialMix } from './spatial-audio';
import { wallFraction } from './math';
import type { Obstacle } from './render/world';
import { Duck, Soundtrack } from './soundtrack';
import { impactSound, explosionSound, gradeSound, debrisRain, glassShards, softCeilingCurve, tanhCurve, RICOCHET_RATIOS } from './effect-audio';
import type { SoundProfile } from './effect-audio';
import type { ImpactKind } from './effect-math';
import { blastProximity, duckDepthDb } from './spatial-audio';
import { Ambience } from './audio-ambience';
import type { AmbienceInfo } from './audio-ambience';
import type { BreakKind, ExplosionKind, ImpactGrade } from './game-events-v19';

/** Seeded white noise (deterministic: offline renders are repeatable). */
function seededNoise(context: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate), data = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let index = 0; index < data.length; index++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; data[index] = state / 2147483648 - 1; }
  return buffer;
}

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private engineDetuned: OscillatorNode | null = null;
  private engineLfo: OscillatorNode | null = null;
  private engineSources: AudioScheduledSourceNode[] = [];
  private rumbleGain: GainNode | null = null;
  private whineOscillator: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;
  private engineDuck: Duck | null = null;
  private startAt = -100; private lastStartup = -100;
  private pulseClock = 0; private pulsePhase = 0; private pulseCount = 0; private pulseAt = -1;
  private closeFilter: BiquadFilterNode | null = null;
  private ambience: Ambience | null = null;
  private debris: AudioBuffer[] = [];
  private glass: AudioBuffer | null = null;
  private ducks = 0; private lastDuckDb = 0; private knocks = 0;
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
  private ceiling: WaveShaperNode | null = null;
  private output: GainNode | null = null;
  private night = false;
  private battleGain: GainNode | null = null;
  private effectsVolume = 1; private engineVolume = 1; private alertsVolume = 1;
  private readonly active = new Set<AudioScheduledSourceNode>();
  private trackSource: AudioBufferSourceNode | null = null;
  private disposed = false;
  private fieldActive = false;
  private events = 0; private cancelled = 0;
  private whiteNoise: AudioBuffer | null = null;
  private interior = false;

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
      this.closeFilter = this.context.createBiquadFilter(); this.closeFilter.type = 'lowpass'; this.closeFilter.frequency.value = 20000; this.closeFilter.Q.value = .5;
      const ceiling = this.context.createWaveShaper(); ceiling.curve = softCeilingCurve();
      this.master.connect(limiter).connect(this.output).connect(this.closeFilter).connect(ceiling).connect(this.context.destination);
      this.ceiling = ceiling;
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
      this.whiteNoise = seededNoise(this.context, 2, 90137);
      this.debris = [11, 23, 37].map(seed => { const data = debrisRain(this.context!.sampleRate, seed), buffer = this.context!.createBuffer(1, data.length, this.context!.sampleRate); buffer.copyToChannel(data, 0); return buffer; });
      { const data = glassShards(this.context.sampleRate, 5), buffer = this.context.createBuffer(1, data.length, this.context.sampleRate); buffer.copyToChannel(data, 0); this.glass = buffer; }
      this.engineDuck = new Duck(this.context, this.field);
      // Engine: low rumble (noise through 90 Hz low-pass) + two detuned saws + 8-12 Hz amplitude modulation.
      const filter = this.context.createBiquadFilter(), shaper = this.context.createGain(), modulation = this.context.createGain();
      const rumble = this.context.createBufferSource(), rumbleFilter = this.context.createBiquadFilter();
      this.engineGain = this.context.createGain(); this.rumbleGain = this.context.createGain();
      const first = this.context.createOscillator(), second = this.context.createOscillator(), lfo = this.context.createOscillator(), lfoDepth = this.context.createGain();
      first.type = 'sawtooth'; second.type = 'sawtooth'; first.frequency.value = 34; second.frequency.value = 34; second.detune.value = 22;
      filter.type = 'lowpass'; filter.frequency.value = 140; shaper.gain.value = .5;
      rumble.buffer = this.whiteNoise; rumble.loop = true; rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 90; this.rumbleGain.gain.value = 0;
      modulation.gain.value = .85; lfo.frequency.value = 9; lfoDepth.gain.value = .22; lfo.connect(lfoDepth).connect(modulation.gain);
      this.engineGain.gain.value = 0;
      first.connect(filter); second.connect(filter); filter.connect(shaper).connect(modulation);
      rumble.connect(rumbleFilter).connect(this.rumbleGain).connect(modulation);
      modulation.connect(this.engineGain).connect(this.engineDuck.node);
      this.whineOscillator = this.context.createOscillator(); this.whineGain = this.context.createGain();
      this.whineOscillator.type = 'triangle'; this.whineOscillator.frequency.value = 60; this.whineGain.gain.value = 0;
      this.whineOscillator.connect(this.whineGain).connect(this.engineDuck.node);
      for (const node of [first, second, lfo, rumble, this.whineOscillator]) node.start();
      this.engineOscillator = first; this.engineDetuned = second; this.engineLfo = lfo; this.engineSources = [first, second, lfo, rumble, this.whineOscillator];
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
      track.connect(this.trackFilter).connect(this.trackGain).connect(this.engineDuck.node); track.start();
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
      this.output?.gain.setTargetAtTime(enabled ? .55 : .8, this.context.currentTime, .05);
    }
    this.ambience?.setNight(enabled);
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

  /**
   * Engine bed. `wheelPhase` (radians, optional) synchronises track knocks with the wheel animation;
   * without it the phase is integrated from speed here.
   */
  engine(speed: number, wheelPhase?: number): void {
    if (!this.context || !this.engineOscillator || !this.engineGain || !this.engineDetuned) return;
    const power = Math.min(1, Math.abs(Number.isFinite(speed) ? speed : 0) / 20);
    const now = this.context.currentTime;
    if (!this.fieldActive) {
      this.field?.gain.setTargetAtTime(1, now, .025); this.fieldActive = true;
      if (now - this.lastStartup > 8) this.startup(now);
    }
    const since = now - this.startAt, ramp = Math.max(0, Math.min(1, since / 1.5)), factor = .22 + .78 * ramp;
    const base = 34 + power * 48, glide = base * (.55 + .45 * ramp);
    this.engineOscillator.frequency.setTargetAtTime(glide, now, .16);
    this.engineDetuned.frequency.setTargetAtTime(glide, now, .16);
    this.engineLfo?.frequency.setTargetAtTime(8 + power * 4, now, .3);
    this.engineGain.gain.setTargetAtTime((0.035 + power * 0.065) * this.engineVolume * factor, now, 0.16);
    this.rumbleGain?.gain.setTargetAtTime((.9 + power * 1.1) * this.engineVolume, now, .2);
    this.trackGain?.gain.setTargetAtTime(power * .5 * this.engineVolume, now, .12);
    this.trackFilter?.frequency.setTargetAtTime(240 + power * 1100, now, .12);
    this.trackKnock(power, now, wheelPhase);
  }
  /** 0-1.5 s start-up: rising whine that falls into idle. */
  private startup(now: number): void {
    this.startAt = now; this.lastStartup = now;
    if (!this.whineOscillator || !this.whineGain) return;
    const frequency = this.whineOscillator.frequency, gain = this.whineGain.gain, level = .05 * this.engineVolume;
    frequency.cancelScheduledValues(now); gain.cancelScheduledValues(now);
    frequency.setValueAtTime(70, now); frequency.exponentialRampToValueAtTime(300, now + .7); frequency.exponentialRampToValueAtTime(46, now + 1.5);
    gain.setValueAtTime(0, now); gain.linearRampToValueAtTime(level, now + .25); gain.setValueAtTime(level, now + .7); gain.linearRampToValueAtTime(0, now + 1.5);
  }
  private trackKnock(power: number, now: number, wheelPhase?: number): void {
    if (!this.context || !this.engineDuck || power < .04 || this.engineVolume === 0 || this.effectsVolume === 0 && false) { this.pulseClock = now; return; }
    if (wheelPhase === undefined) { this.pulsePhase += Math.max(0, now - this.pulseClock) * power * 20 * 1.8; this.pulseClock = now; }
    const phase = wheelPhase === undefined ? this.pulsePhase : wheelPhase / (Math.PI / 2);
    const count = Math.floor(phase);
    if (this.pulseCount === 0) { this.pulseCount = count; return; }
    if (count === this.pulseCount) return;
    this.pulseCount = count;
    if (now - this.pulseAt < .07 || this.voices > 18) return;
    this.pulseAt = now; this.knocks++;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(78, now); oscillator.frequency.exponentialRampToValueAtTime(38, now + .05);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime((.05 + power * .07) * this.engineVolume, now + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .06);
    oscillator.connect(gain).connect(this.engineDuck.node); this.register(oscillator, [gain]);
    oscillator.start(now); oscillator.stop(now + .07);
  }
  /**
   * Street ambience tick. Call once per frame while playing (dt seconds). Optional inputs: neon/cooling proximity 0..1
   * and the nearest enemy position (distant gunfire comes from that bearing). Never called = no ambience.
   */
  ambienceUpdate(dt: number, info: AmbienceInfo = {}): void {
    if (!this.context || !this.battleGain || !this.whiteNoise || this.disposed) return;
    if (!this.ambience) {
      const context = this.context, noise = this.whiteNoise;
      this.ambience = new Ambience({ context, destination: this.battleGain, noise, voices: () => this.voices,
        register: (source, nodes, release) => this.register(source, nodes, release),
        mixAt: position => this.mixAt(position), listener: () => this.listener });
      this.ambience.setNight(this.night);
    }
    this.ambience.update(dt, info);
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
    this.cannonEvent(calibre, mix, own ? 0 : Math.min(.8, distance / 343), own, own ? 0 : distance);
  }
  perspective(interior: boolean): void { this.interior = interior; }
  /** Five-layer main gun: crack, body, mid snap, tail, pressure sine. Near / mid / far tiers; interior = low-passed + mechanical. */
  private cannonEvent(calibre: number, mix: { pan: number; gain: number; cutoff: number }, delay: number, own: boolean, distance: number): void {
    const layers = own || distance < 60 ? 5 : distance < 180 ? 3 : 2;
    if (!this.context || !this.whiteNoise || !this.battleGain || this.context.state !== 'running' || this.voices + layers > 24 || this.effectsVolume === 0) return;
    const context = this.context, time = context.currentTime + delay, enclosed = own && this.interior;
    const filter = context.createBiquadFilter(), panner = context.createStereoPanner();
    filter.type = 'lowpass'; filter.frequency.value = Math.min(mix.cutoff, enclosed ? 1400 : 8200);
    panner.pan.value = mix.pan; filter.connect(panner).connect(this.battleGain);
    if (this.echo && !enclosed) panner.connect(this.echo);
    const bore = Math.max(90, Math.min(155, calibre)) / 120, level = Math.sqrt(bore) * mix.gain;
    let remaining = layers;
    const release = (): void => { if (--remaining === 0) { filter.disconnect(); panner.disconnect(); } };
    const noise = (offset: number, duration: number, amplitude: number, frequency: number, type: BiquadFilterType): void => {
      const source = context.createBufferSource(), gain = context.createGain(), band = context.createBiquadFilter();
      source.buffer = this.whiteNoise; band.type = type; band.frequency.value = frequency; band.Q.value = .6;
      const start = time + offset;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(amplitude * level, start + .002);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      source.connect(band).connect(gain).connect(filter); this.register(source, [band, gain], release);
      source.start(start, offset % .9); source.stop(start + duration);
    };
    if (layers === 5) {
      noise(0, .075, enclosed ? .29 : .9, 2800, 'highpass');
      noise(.009, .55, enclosed ? .55 : .72, 620, 'lowpass');
      noise(.075, .09, enclosed ? .3 : .11, enclosed ? 900 : 1600, 'bandpass');
      noise(.53, .14, enclosed ? .2 : .075, 920, 'bandpass');
    } else if (layers === 3) {
      noise(.009, .6, .6, 520, 'lowpass');
      noise(.53, .16, .08, 700, 'bandpass');
    } else noise(.009, .7, .5, 300, 'lowpass');
    const pressure = context.createOscillator(), gain = context.createGain(); pressure.type = 'sine';
    pressure.frequency.setValueAtTime(92 / Math.sqrt(bore), time); pressure.frequency.exponentialRampToValueAtTime(38, time + .3 * bore);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(1.4 * level, time + .007);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .5 + .3 * bore);
    pressure.connect(gain).connect(filter); this.register(pressure, [gain], release); pressure.start(time); pressure.stop(time + .52 + .3 * bore);
    this.events++;
  }
  /**
   * Armour contact. Without `grade` the v1.8 sound is kept; with a grade: penetrate = muffled thud + crunch,
   * ricochet = inharmonic metallic ping (1 : 2.76 : 5.4), blocked = dust + short knock.
   */
  impact(position: { readonly x: number; readonly z: number }, destroyed: boolean, kind: ImpactKind = 'armor', calibre = 120, grade?: ImpactGrade): void {
    const distance = Math.hypot(position.x - this.listener.x, position.z - this.listener.z), delay = Math.min(.8, distance / 343);
    if (grade) { this.gradedImpact(grade, this.mixAt(position), delay, calibre, destroyed); return; }
    const profile = impactSound(kind, destroyed); profile.volume *= Math.sqrt(Math.max(90, Math.min(155, calibre)) / 120);
    this.burst(profile, this.mixAt(position), delay);
  }
  /** Shared per-event chain: low-pass (distance) -> pan -> effects bus (+echo). Released when all `count` sources end. */
  private chain(mix: { pan: number; cutoff: number }, count: number, echo: boolean, cutoff?: number): { filter: BiquadFilterNode; panner: StereoPannerNode; release: () => void } | null {
    if (!this.context || !this.battleGain || this.context.state !== 'running' || this.effectsVolume === 0 || this.voices + count > 24) return null;
    const filter = this.context.createBiquadFilter(), panner = this.context.createStereoPanner();
    filter.type = 'lowpass'; filter.frequency.value = Math.min(mix.cutoff, cutoff ?? 20000); panner.pan.value = mix.pan;
    filter.connect(panner).connect(this.battleGain); if (echo && this.echo) panner.connect(this.echo);
    let remaining = count;
    return { filter, panner, release: () => { if (--remaining === 0) { filter.disconnect(); panner.disconnect(); } } };
  }
  private noiseHit(chain: { filter: BiquadFilterNode; release: () => void }, start: number, duration: number, amplitude: number, frequency: number, type: BiquadFilterType, q = .8, sweepTo?: number, buffer?: AudioBuffer | null, offset = 0, steep = false): void {
    const context = this.context; if (!context) return;
    const source = context.createBufferSource(), band = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer ?? this.whiteNoise; band.type = type; band.Q.value = q; band.frequency.setValueAtTime(frequency, start);
    if (sweepTo) band.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(amplitude, start + .002);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    if (steep) { // second identical stage: -24 dB/oct, keeps the swept body out of the 2-6 kHz crack band
      const second = context.createBiquadFilter(); second.type = type; second.Q.value = .7; second.frequency.setValueAtTime(frequency, start);
      if (sweepTo) second.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
      source.connect(band).connect(second).connect(gain).connect(chain.filter); this.register(source, [band, second, gain], chain.release);
    } else { source.connect(band).connect(gain).connect(chain.filter); this.register(source, [band, gain], chain.release); }
    source.start(start, offset); source.stop(start + duration + .01);
  }
  private toneHit(chain: { filter: BiquadFilterNode; release: () => void }, start: number, duration: number, amplitude: number, from: number, to = from, type: OscillatorType = 'sine'): void {
    const context = this.context!, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(amplitude, start + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(chain.filter); this.register(oscillator, [gain], chain.release);
    oscillator.start(start); oscillator.stop(start + duration + .01);
  }
  private gradedImpact(grade: ImpactGrade, mix: { pan: number; gain: number; cutoff: number }, delay: number, calibre: number, destroyed: boolean): void {
    const count = grade === 'ricochet' ? 4 : 3, chain = this.chain(mix, count, true);
    if (!chain || !this.context) return;
    const time = this.context.currentTime + delay, level = gradeSound(grade, calibre, destroyed).level * mix.gain;
    if (grade === 'penetrate') {
      this.toneHit(chain, time, .24, .8 * level, 150, 52);
      this.noiseHit(chain, time, .26, .9 * level, 900, 'lowpass', .7);
      this.noiseHit(chain, time + .02, .2, .55 * level, 1900, 'bandpass', 1.1);
    } else if (grade === 'ricochet') {
      const base = 1250 * Math.pow(120 / Math.max(90, Math.min(155, calibre)), .25);
      RICOCHET_RATIOS.forEach((ratio, index) => this.toneHit(chain, time, [.7, .45, .28][index] ?? .3, level * [1, .6, .4][index]!, base * ratio));
      this.noiseHit(chain, time, .035, .5 * level, 5200, 'bandpass', 1.5);
    } else {
      this.noiseHit(chain, time, .16, .9 * level, 1300, 'bandpass', .9);
      this.toneHit(chain, time, .05, .6 * level, 250, 130);
      this.noiseHit(chain, time + .004, .06, .5 * level, 800, 'bandpass', 1);
    }
    this.events++;
  }
  /** Dedicated v1.9 explosion: crack, low shock (soft-clipped), swept body, debris rain, rumble tail, near-blast pressure. */
  explosion(position: { readonly x: number; readonly z: number }, kind: ExplosionKind, power: number): void {
    const context = this.context;
    if (!context || !this.whiteNoise || !this.battleGain || context.state !== 'running' || this.effectsVolume === 0) return;
    const distance = Math.hypot(position.x - this.listener.x, position.z - this.listener.z);
    const mix = this.mixAt(position), delay = Math.min(.8, distance / 343), time = context.currentTime + delay;
    const profile = explosionSound(kind, power);
    // Near-blast pressure: bus ducking (does not use a voice) and muffled main output with a faint ring.
    const depth = duckDepthDb(distance);
    if (depth > 0) {
      this.soundtrack?.duck(depth, time); this.engineDuck?.apply(depth, time); this.ambience?.duck(depth, time);
      this.ducks++; this.lastDuckDb = depth;
    }
    const proximity = blastProximity(distance);
    if (proximity > 0 && this.closeFilter) {
      const low = this.night ? 3400 : 1800, target = 20000 * Math.pow(low / 20000, proximity);
      const frequency = this.closeFilter.frequency;
      frequency.cancelScheduledValues(time); frequency.setTargetAtTime(target, time, .008); frequency.setTargetAtTime(20000, time + .12, .28);
    }
    // Voice budget: up to 7 sources; debris rain goes first, then the crack, then the explosion is skipped.
    const room = 24 - this.voices - (proximity > 0 ? 1 : 0);
    const withDebris = room >= 5, withCrack = room >= 4;
    const count = 3 + (withDebris ? 1 : 0) + (withCrack ? 1 : 0);
    if (room < 3) return;
    const chain = this.chain(mix, count + (proximity > 0 ? 0 : 0), true, distance > 120 ? 700 : undefined);
    if (!chain) return;
    const level = profile.level * mix.gain;
    if (withCrack) this.noiseHit(chain, time, .022, profile.crack * level, 2500, 'highpass', .7);
    // low shock wave through a tanh soft clipper
    {
      const oscillator = context.createOscillator(), envelope = context.createGain(), shaper = context.createWaveShaper(), out = context.createGain();
      shaper.curve = tanhCurve(profile.drive); oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(profile.shockFrom, time); oscillator.frequency.exponentialRampToValueAtTime(profile.shockTo, time + profile.shockSeconds);
      envelope.gain.setValueAtTime(0, time); envelope.gain.linearRampToValueAtTime(1, time + .01); envelope.gain.exponentialRampToValueAtTime(.0001, time + profile.shockSeconds + .15);
      out.gain.value = profile.shock * level;
      oscillator.connect(envelope).connect(shaper).connect(out).connect(chain.filter);
      this.register(oscillator, [envelope, shaper, out], chain.release);
      oscillator.start(time); oscillator.stop(time + profile.shockSeconds + .16);
    }
    // body: noise through a low-pass that sweeps down
    this.noiseHit(chain, time, profile.bodySeconds, profile.body * level, profile.bodyFrom, 'lowpass', .7, profile.bodyTo, null, .1, true);
    // rumble tail (echo network adds the street-canyon repeats)
    {
      const source = context.createBufferSource(), low = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = this.whiteNoise; low.type = 'lowpass'; low.frequency.value = 130; low.Q.value = .7;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(profile.rumble * level * 2.4, time + .08);
      gain.gain.exponentialRampToValueAtTime(.0001, time + profile.rumbleSeconds);
      source.connect(low).connect(gain).connect(chain.filter); this.register(source, [low, gain], chain.release);
      source.start(time, .3); source.stop(time + profile.rumbleSeconds + .02);
    }
    if (withDebris && this.debris.length) {
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = this.debris[(this.events + this.ducks) % this.debris.length] ?? null; gain.gain.value = profile.debris * level;
      source.connect(gain).connect(chain.filter); this.register(source, [gain], chain.release);
      source.start(time); source.stop(time + 1.85);
    }
    if (proximity > 0 && this.voices < 24) {
      const ring = context.createOscillator(), gain = context.createGain();
      const peak = .01 * proximity * (this.night ? .35 : 1);
      // the ring builds up after the blast itself (hearing fatigue), so it stays out of the first 300 ms
      ring.frequency.value = 3200; gain.gain.setValueAtTime(0, time + .3); gain.gain.linearRampToValueAtTime(peak, time + .45);
      gain.gain.exponentialRampToValueAtTime(.0001, time + 1.1);
      ring.connect(gain).connect(this.ceiling ?? context.destination); this.register(ring, [gain]);
      ring.start(time + .3); ring.stop(time + 1.15);
    }
    this.events++;
  }
  /** v1.9 shell passing the listener: sine + band noise 1.8 -> 0.6 kHz in ~0.3 s with a pan sweep across the head. Caller triggers once per shell. */
  flyby(position: { readonly x: number; readonly z: number }, speed: number, calibre: number): void {
    const mix = this.mixAt(position), chain = this.chain(mix, 2, false);
    if (!chain || !this.context || !this.whiteNoise) return;
    const context = this.context, time = context.currentTime;
    const side = mix.pan >= 0 ? 1 : -1;
    chain.panner.pan.setValueAtTime(.85 * side, time); chain.panner.pan.linearRampToValueAtTime(-.85 * side, time + .3);
    const velocity = Math.max(.35, Math.min(1.4, (Number.isFinite(speed) ? speed : 190) / 190));
    const level = .5 * velocity * Math.sqrt(Math.max(90, Math.min(155, calibre)) / 120) * Math.max(.5, mix.gain);
    this.toneHit(chain, time, .32, .55 * level, 1800, 600);
    this.noiseHit(chain, time, .32, 1.3 * level, 1800, 'bandpass', 2.2, 600);
    this.events++;
  }
  /** v1.9 breakable street furniture: sign clang, neon fizz + glass, stall crate burst. */
  propBreak(position: { readonly x: number; readonly z: number }, kind: BreakKind): void {
    const mix = this.mixAt(position), delay = Math.min(.8, Math.hypot(position.x - this.listener.x, position.z - this.listener.z) / 343);
    const chain = this.chain(mix, kind === 'stall' ? 4 : kind === 'sign' ? 4 : 3, true);
    if (!chain || !this.context) return;
    const time = this.context.currentTime + delay, level = mix.gain * .55;
    if (kind === 'sign') {
      [1, 2.32, 4.1].forEach((ratio, index) => this.toneHit(chain, time, [.6, .4, .25][index] ?? .3, level * [.8, .5, .3][index]!, 190 * ratio, 185 * ratio));
      this.noiseHit(chain, time, .15, level * .8, 520, 'lowpass', .7);
    } else if (kind === 'neon') {
      const source = this.context.createBufferSource(), gain = this.context.createGain(), band = this.context.createBiquadFilter();
      source.buffer = this.whiteNoise; band.type = 'bandpass'; band.frequency.value = 4800; band.Q.value = 2.2;
      for (let step = 0; step < 14; step++) gain.gain.setValueAtTime(step % 2 === 0 ? level * .55 : level * .12, time + step * .018);
      gain.gain.setValueAtTime(level * .3, time + .25); gain.gain.exponentialRampToValueAtTime(.0001, time + .34);
      source.connect(band).connect(gain).connect(chain.filter); this.register(source, [band, gain], chain.release);
      source.start(time); source.stop(time + .36);
      const glass = this.context.createBufferSource(), glassGain = this.context.createGain();
      glass.buffer = this.glass; glassGain.gain.value = level * 1.1; glass.connect(glassGain).connect(chain.filter);
      this.register(glass, [glassGain], chain.release); glass.start(time + .05); glass.stop(time + .8);
      this.toneHit(chain, time, .12, level * .35, 120, 60);
    } else {
      this.noiseHit(chain, time, .06, level * 1.1, 700, 'bandpass', 1.6);
      this.noiseHit(chain, time + .07, .08, level * .9, 1100, 'bandpass', 1.6);
      this.noiseHit(chain, time + .02, .35, level * .7, 420, 'lowpass', .7);
      this.toneHit(chain, time, .14, level * .6, 150, 70);
    }
    this.events++;
  }
  /** v1.9 opening stinger: <= 1 s, peak <= -14 dBFS at unit volume (procedural: low hit + rising whoosh + bell). */
  stinger(): void {
    const context = this.context;
    if (!context || !this.master || !this.whiteNoise || context.state !== 'running' || this.effectsVolume === 0 || this.voices + 4 > 24) return;
    const time = context.currentTime, bus = context.createGain(); bus.gain.value = .14 * this.effectsVolume; bus.connect(this.master);
    let remaining = 4;
    const release = (): void => { if (--remaining === 0) bus.disconnect(); };
    const tone = (frequency: number, to: number, amplitude: number, duration: number, offset = 0): void => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.setValueAtTime(frequency, time + offset); if (to !== frequency) oscillator.frequency.exponentialRampToValueAtTime(to, time + offset + duration);
      gain.gain.setValueAtTime(0, time + offset); gain.gain.linearRampToValueAtTime(amplitude, time + offset + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, time + offset + duration);
      oscillator.connect(gain).connect(bus); this.register(oscillator, [gain], release);
      oscillator.start(time + offset); oscillator.stop(time + offset + duration + .01);
    };
    tone(78, 40, 1, .9);
    tone(660, 660, .35, .85, .1); tone(660 * 2.76, 660 * 2.76, .12, .5, .1);
    const source = context.createBufferSource(), band = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.whiteNoise; band.type = 'bandpass'; band.Q.value = 1.2;
    band.frequency.setValueAtTime(300, time); band.frequency.exponentialRampToValueAtTime(3200, time + .45);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.35, time + .4); gain.gain.exponentialRampToValueAtTime(.0001, time + .6);
    source.connect(band).connect(gain).connect(bus); this.register(source, [band, gain], release);
    source.start(time, .2); source.stop(time + .62);
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
    if (this.context && this.whineGain) { this.whineGain.gain.cancelScheduledValues(this.context.currentTime); this.whineGain.gain.setTargetAtTime(0, this.context.currentTime, .03); }
    if (this.context && this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(0, this.context.currentTime, .03);
    this.ambience?.stop();
    this.fieldActive = false;
    this.soundtrack?.stop();
  }
  stats(): { voices: number; maxVoices: number; events: number; cancelled: number; disposed: boolean; ducks: number; lastDuckDb: number; knocks: number } {
    return { voices: this.voices, maxVoices: 24, events: this.events, cancelled: this.cancelled, disposed: this.disposed, ducks: this.ducks, lastDuckDb: this.lastDuckDb, knocks: this.knocks };
  }
  dispose(): void {
    if (this.disposed) return; this.stop(); this.disposed = true;
    for (const node of this.engineSources) { try { node.stop(); } catch { /* not started */ } node.disconnect(); }
    this.ambience?.dispose(); this.ambience = null;
    this.trackSource?.stop(); this.trackSource?.disconnect();
    this.master?.disconnect(); this.output?.disconnect(); this.field?.disconnect(); this.echo?.disconnect(); this.battleGain?.disconnect();
    if (this.context && typeof this.context.close === 'function') void this.context.close();
    this.noise = null; this.whiteNoise = null; this.debris = []; this.glass = null; this.context = null;
  }
}
