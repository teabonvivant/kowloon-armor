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
