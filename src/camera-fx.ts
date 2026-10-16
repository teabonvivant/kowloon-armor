import { clamp } from './math';

/** Hit-stop budget (seconds): per-event durations plus a rolling window cap so chains never feel stuck. */
export const HITSTOP_LIMITS = { single: .1, window: 2, windowTotal: .25, scale: .35 } as const;
export const HITSTOP_EVENT = { kill: .09, explosion: .045, penetrate: .04, ricochet: 0, blocked: 0 } as const;
export type HitStopKind = keyof typeof HITSTOP_EVENT;
export class HitStopBudget {
  private readonly events: { at: number; seconds: number }[] = [];
  /** Returns the seconds of hit-stop granted for this event after applying the per-event and 2 s window caps. */
  grant(now: number, kind: HitStopKind): number {
    while (this.events.length && now - (this.events[0]?.at ?? 0) > HITSTOP_LIMITS.window) this.events.shift();
    const used = this.events.reduce((sum, event) => sum + event.seconds, 0);
    const seconds = clamp(Math.min(HITSTOP_EVENT[kind], HITSTOP_LIMITS.single, HITSTOP_LIMITS.windowTotal - used), 0, HITSTOP_LIMITS.single);
    if (seconds > 0) this.events.push({ at: now, seconds });
    return seconds;
  }
  reset(): void { this.events.length = 0; }
}

/** v1.9 camera language. All pure; `View` only samples them. Reduced motion always yields zero. */
export const BLAST_LIMITS = { offset: .6, rollDegrees: 1.2, seconds: .5 } as const;
export const KILLCAM_LIMITS = { seconds: .5, fovDegrees: 6, bias: .22, release: .08 } as const;
export const LIGHT_PULSE_LIMITS = { gain: .15, seconds: .09, lowFlash: .18 } as const;

/** Scope / gunner / driver dampening of camera impulses (scope <= 0.12). */
export function viewFactor(mode: string, scope: boolean, zoom: number): number {
  return scope ? .12 / Math.max(1, zoom) : mode === 'gunner' ? .14 : mode === 'driver' ? .5 : 1;
}
/** Directional explosion jolt: `offset` (m, along the blast->camera direction) and `roll` (rad), gone after 0.5 s. */
export function blastImpulse(age: number, power: number, distance: number, reduced: boolean, view = 1): { offset: number; roll: number } {
  if (reduced || !(age >= 0) || age >= BLAST_LIMITS.seconds) return { offset: 0, roll: 0 };
  const strength = clamp(Number.isFinite(power) ? power : 1, 0, 2) / 2;
  const near = clamp(1 - (Number.isFinite(distance) ? Math.max(0, distance) : 90) / 90, 0, 1) ** 1.2;
  const amplitude = clamp(.2 + .8 * strength, 0, 1) * near * clamp(view, 0, 1);
  const decay = (1 - age / BLAST_LIMITS.seconds) ** 3, attack = Math.min(1, age / .012);
  const wave = Math.cos(age * 26);
  return {
    offset: clamp(BLAST_LIMITS.offset * amplitude * attack * decay * wave, -BLAST_LIMITS.offset, BLAST_LIMITS.offset),
    roll: clamp(BLAST_LIMITS.rollDegrees * Math.PI / 180 * amplitude * attack * decay * Math.sin(age * 27), -BLAST_LIMITS.rollDegrees * Math.PI / 180, BLAST_LIMITS.rollDegrees * Math.PI / 180),
  };
}
/** Kill push-in envelope 0..1 over 0.5 s; if interrupted at `cancelAge` it releases within 80 ms. */
export function killcamEnvelope(age: number, cancelAge = Infinity): number {
  if (!(age >= 0)) return 0;
  const base = (t: number) => t >= KILLCAM_LIMITS.seconds ? 0 : Math.sin(Math.PI * t / KILLCAM_LIMITS.seconds) ** 2;
  if (age < cancelAge) return base(age);
  const fade = 1 - (age - cancelAge) / KILLCAM_LIMITS.release;
  return fade <= 0 ? 0 : base(cancelAge) * fade;
}
/** Field-of-view change (deg, <= 0) and look-at bias (0..0.22) of the kill push-in. */
export function killcamPush(age: number, reduced: boolean, cancelAge = Infinity): { fov: number; bias: number } {
  if (reduced) return { fov: 0, bias: 0 };
  const e = killcamEnvelope(age, cancelAge);
  return { fov: e > 0 ? -KILLCAM_LIMITS.fovDegrees * e : 0, bias: KILLCAM_LIMITS.bias * e };
}
/** Light pulse gain (>= 1, <= 1.15) on the existing lights; 90 ms; reduced motion = none; low flash = 0.18x. */
export function lightPulseGain(age: number, strength: number, reduced: boolean, lowFlash: boolean, seconds: number = LIGHT_PULSE_LIMITS.seconds): number {
  const span = clamp(seconds, .01, LIGHT_PULSE_LIMITS.seconds);
  if (reduced || !(age >= 0) || age >= span) return 1;
  const peak = clamp(Number.isFinite(strength) ? strength : 0, 0, 1) * LIGHT_PULSE_LIMITS.gain * (lowFlash ? LIGHT_PULSE_LIMITS.lowFlash : 1);
  return 1 + peak * (1 - age / span) ** 2;
}
