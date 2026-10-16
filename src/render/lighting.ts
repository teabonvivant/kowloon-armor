import { Vector3 } from 'three';
import { setGlowMode } from './materials';

export type LightingPreset = 'day' | 'dusk';
/** Neon flicker never dims a sign by more than this fraction (AC-HK-1: <=10%). */
export const FLICKER_DEPTH = .1;
/** Three independent flicker channels; every atlas sign belongs to one, so at most three materials' worth of flicker. */
export const FLICKER_CHANNELS = 3;
/** Shared uniform vector read by the sign shader (x/y/z = channel 0/1/2, 1 = full brightness). */
export const flicker = new Vector3(1, 1, 1);

const listeners = new Set<(dusk: boolean) => void>();
let current: LightingPreset = 'day';

/** Called from `View.lighting()` (non-realism path). Raises neon/emissive strength at dusk; day values are unchanged. */
export function applyWorldLighting(preset: LightingPreset): void {
  current = preset === 'dusk' ? 'dusk' : 'day';
  setGlowMode(current === 'dusk');
  for (const listener of listeners) listener(current === 'dusk');
}
export const worldLighting = (): LightingPreset => current;
/** Subscribe to day/dusk changes (fires immediately with the current state). */
export function onWorldLighting(listener: (dusk: boolean) => void): void { listeners.add(listener); listener(current === 'dusk'); }

export function reducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.body?.classList?.contains('reduce-motion')) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Low-frequency, irregular flicker per channel, in [1 - FLICKER_DEPTH, 1]. Static when motion is reduced. */
export function flickerAt(seconds: number, channel: number): number {
  const t = seconds + channel * 17.31;
  const wave = Math.sin(t * .83 + channel * 2.1) * Math.sin(t * 2.17 + channel) * .5 + .5;
  const burst = Math.max(0, Math.sin(t * .31 + channel * 1.7) - .55) / .45;
  return 1 - FLICKER_DEPTH * Math.min(1, wave * .45 + burst * .55 * wave);
}

let lastUpdate = -1;
export function updateFlicker(seconds: number): Vector3 {
  if (Math.abs(seconds - lastUpdate) < 1 / 30) return flicker;
  lastUpdate = seconds;
  if (reducedMotion()) return flicker.set(1, 1, 1);
  return flicker.set(flickerAt(seconds, 0), flickerAt(seconds, 1), flickerAt(seconds, 2));
}
