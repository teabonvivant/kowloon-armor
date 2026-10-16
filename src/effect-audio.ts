import type { ExplosionKind, ImpactGrade } from './game-events-v19';
import { clamp } from './math';
import type { ImpactKind } from './effect-math';

export interface SoundProfile { frequency: number; duration: number; volume: number; cutoff: number; crack: number; tail: number }
export function cannonSound(calibre: number): SoundProfile {
  const bore = clamp(Number.isFinite(calibre) ? calibre : 120, 90, 155) / 120;
  return { frequency: 100 / Math.sqrt(bore), duration: .68 * bore, volume: .38 * Math.sqrt(bore), cutoff: 6200 / bore, crack: .17, tail: .1 * bore };
}
export function impactSound(kind: ImpactKind, destroyed: boolean): SoundProfile {
  if (destroyed) return { frequency: 62, duration: 1, volume: .44, cutoff: 2800, crack: .2, tail: .15 };
  const frequency = { armor: 280, track: 170, building: 120, road: 85, metal: 340 }[kind];
  return { frequency, duration: kind === 'road' || kind === 'building' ? .36 : .2, volume: .22,
    cutoff: { armor: 5800, track: 3100, building: 1700, road: 1100, metal: 6400 }[kind], crack: .15, tail: .04 };
}

/* ---------------------------------------------------------------------------------------------
 * v1.9 parameter tables and pure sample generators (no AudioContext needed, so they are unit-testable).
 * ------------------------------------------------------------------------------------------- */

export interface ExplosionProfile {
  /** Overall level before distance gain. */
  level: number;
  crack: number; shock: number; body: number; rumble: number; debris: number;
  shockFrom: number; shockTo: number; shockSeconds: number;
  bodyFrom: number; bodyTo: number; bodySeconds: number;
  rumbleSeconds: number;
  /** Extra WaveShaper drive (soft clipping adds "weight"). */
  drive: number;
}
const EXPLOSIONS: Record<ExplosionKind, ExplosionProfile> = {
  barrel: { level: .9, crack: .1, shock: 1.2, body: .2, rumble: .34, debris: .08, shockFrom: 76, shockTo: 30, shockSeconds: .8, bodyFrom: 1900, bodyTo: 170, bodySeconds: .8, rumbleSeconds: 1.7, drive: 2.2 },
  lpg: { level: .95, crack: .12, shock: 1.2, body: .22, rumble: .34, debris: .08, shockFrom: 70, shockTo: 30, shockSeconds: .85, bodyFrom: 1900, bodyTo: 170, bodySeconds: .85, rumbleSeconds: 1.8, drive: 2.4 },
  vehicle: { level: 1, crack: .1, shock: 1.3, body: .24, rumble: .4, debris: .09, shockFrom: 64, shockTo: 28, shockSeconds: .95, bodyFrom: 1900, bodyTo: 160, bodySeconds: .95, rumbleSeconds: 2, drive: 2.4 },
  tanker: { level: 1.05, crack: .09, shock: 1.4, body: .28, rumble: .5, debris: .1, shockFrom: 54, shockTo: 24, shockSeconds: 1.25, bodyFrom: 1900, bodyTo: 130, bodySeconds: 1.3, rumbleSeconds: 2.3, drive: 2.8 },
  ammo: { level: .95, crack: .15, shock: 1.1, body: .2, rumble: .3, debris: .12, shockFrom: 82, shockTo: 34, shockSeconds: .7, bodyFrom: 1900, bodyTo: 200, bodySeconds: .7, rumbleSeconds: 1.5, drive: 2.2 },
  strike: { level: 1.05, crack: .1, shock: 1.4, body: .3, rumble: .55, debris: .1, shockFrom: 48, shockTo: 22, shockSeconds: 1.4, bodyFrom: 1900, bodyTo: 120, bodySeconds: 1.4, rumbleSeconds: 2.4, drive: 3 },
};
export function explosionSound(kind: ExplosionKind, power: number): ExplosionProfile {
  const base = EXPLOSIONS[kind] ?? EXPLOSIONS.barrel;
  const p = clamp(Number.isFinite(power) ? power : 1, .5, 2.5);
  return { ...base, level: base.level * Math.sqrt(p) * .78 };
}

export interface GradeProfile { level: number }
/** Hit-grade tones: penetrate = muffled thud + crunch, ricochet = inharmonic metallic ping, blocked = dust + short knock. */
export const RICOCHET_RATIOS: readonly number[] = [1, 2.76, 5.4];
export function gradeSound(grade: ImpactGrade, calibre: number, destroyed: boolean): GradeProfile {
  const bore = Math.sqrt(clamp(Number.isFinite(calibre) ? calibre : 120, 90, 155) / 120);
  const base = grade === 'penetrate' ? .5 : grade === 'ricochet' ? .3 : .26;
  return { level: base * bore * (destroyed ? 1.25 : 1) };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
/** In-place RBJ band-pass (constant skirt) over a short grain. */
function bandpass(data: Float32Array, start: number, length: number, sampleRate: number, frequency: number, q: number): void {
  const w = 2 * Math.PI * frequency / sampleRate, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let index = 0; index < length; index++) {
    const x = data[start + index] ?? 0, y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; data[start + index] = y;
  }
}
/** Debris rain: 8-14 band-passed grains of 30-60 ms (1-4 kHz) scattered over 0.25-1.6 s, falling amplitude. One buffer = one voice. */
export function debrisRain(sampleRate: number, seed: number, seconds = 1.8): Float32Array<ArrayBuffer> {
  const random = lcg(seed), out = new Float32Array(Math.ceil(sampleRate * seconds));
  const count = 8 + Math.floor(random() * 7);
  for (let grain = 0; grain < count; grain++) {
    const at = .25 + random() * 1.35, length = Math.floor(sampleRate * (.03 + random() * .03));
    const start = Math.floor(at * sampleRate), amplitude = (1 - at / 1.8) * (.5 + random() * .5);
    const piece = new Float32Array(length + 2);
    for (let index = 0; index < length; index++) piece[index] = (random() * 2 - 1) * Math.exp(-index / (length * .35));
    bandpass(piece, 0, length, sampleRate, 1000 + random() * 3000, 2.2);
    for (let index = 0; index < length && start + index < out.length; index++) out[start + index] = (out[start + index] ?? 0) + (piece[index] ?? 0) * amplitude * 3.2;
  }
  let peak = 0; for (const value of out) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let index = 0; index < out.length; index++) out[index] = (out[index] ?? 0) / peak;
  return out;
}
/** Glass shards for a breaking neon tube: 14-20 very short 3-9 kHz ticks over 0.65 s. */
export function glassShards(sampleRate: number, seed: number, seconds = .7): Float32Array<ArrayBuffer> {
  const random = lcg(seed), out = new Float32Array(Math.ceil(sampleRate * seconds));
  const count = 14 + Math.floor(random() * 7);
  for (let shard = 0; shard < count; shard++) {
    const at = Math.pow(random(), 1.6) * (seconds - .1), length = Math.floor(sampleRate * (.004 + random() * .01));
    const start = Math.floor(at * sampleRate), amplitude = (1 - at / seconds * .7) * (.4 + random() * .6);
    const piece = new Float32Array(length + 2);
    for (let index = 0; index < length; index++) piece[index] = (random() * 2 - 1) * Math.exp(-index / (length * .3));
    bandpass(piece, 0, length, sampleRate, 3000 + random() * 6000, 4);
    for (let index = 0; index < length && start + index < out.length; index++) out[start + index] = (out[start + index] ?? 0) + (piece[index] ?? 0) * amplitude * 6;
  }
  let peak = 0; for (const value of out) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let index = 0; index < out.length; index++) out[index] = (out[index] ?? 0) / peak;
  return out;
}
/** Fixed soft ceiling: linear to 0.7, tanh knee towards 0.97 (hard guarantee against inter-bus clipping). */
export function softCeilingCurve(points = 2049): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let index = 0; index < points; index++) {
    const x = index / (points - 1) * 2 - 1, a = Math.abs(x);
    curve[index] = Math.sign(x) * (a <= .7 ? a : .7 + .27 * Math.tanh((a - .7) / .27));
  }
  return curve;
}
/** tanh soft-clip transfer curve normalised to unit gain at full scale. */
export function tanhCurve(drive: number, points = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points), norm = Math.tanh(drive);
  for (let index = 0; index < points; index++) curve[index] = Math.tanh((index / (points - 1) * 2 - 1) * drive) / norm;
  return curve;
}
