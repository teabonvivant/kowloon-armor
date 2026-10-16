import type { Vector3 } from 'three';

/** v1.9 cross-module contract: audio, effects, scene and gameplay agree on these types only. */
export type ExplosionKind = 'barrel' | 'lpg' | 'vehicle' | 'tanker' | 'ammo' | 'strike';
export type PropKind = 'barrel' | 'lpg' | 'car' | 'minibus' | 'tanker' | 'transformer';
/** Armour contact grade: penetrating hit, ricochet (glancing), or blocked (no effect). */
export type ImpactGrade = 'penetrate' | 'ricochet' | 'blocked';
export type BreakKind = 'sign' | 'neon' | 'stall';
export interface ExplosionEvent { kind: ExplosionKind; position: Vector3; power: number; byPlayer: boolean }
export interface GameEventsV19 {
  explosion?: (e: ExplosionEvent) => void;
  flyby?: (position: Vector3, speed: number, calibre: number) => void;
  killcam?: (position: Vector3) => void;
  propBreak?: (kind: BreakKind, position: Vector3) => void;
}
/** Static street furniture that can be broken at run time; never added to or removed from `obstacles`. */
export interface Destructible {
  readonly id: number; readonly kind: BreakKind; readonly x: number; readonly z: number; readonly y: number;
  broken: boolean;
  /** Returns true when this call changed the instance (false if already broken or the 24-active cap was reached). */
  break(power: number): boolean;
}
/** Explosion table: radius (m) and damage vs enemies, per prop kind. Existing values 11/14 m, 90/120 are unchanged. */
export const PROP_TABLE: Readonly<Record<PropKind, { radius: number; damage: number; explosion: ExplosionKind; power: number; score: number; label: string }>> = {
  barrel: { radius: 11, damage: 90, explosion: 'barrel', power: 1, score: 80, label: '引爆油桶' },
  lpg: { radius: 11, damage: 90, explosion: 'lpg', power: 1.2, score: 90, label: '引爆石油氣罐' },
  car: { radius: 14, damage: 120, explosion: 'vehicle', power: 1.4, score: 120, label: '引爆車輛' },
  minibus: { radius: 14, damage: 120, explosion: 'vehicle', power: 1.6, score: 130, label: '引爆小巴' },
  tanker: { radius: 18, damage: 150, explosion: 'tanker', power: 2, score: 180, label: '引爆油罐車' },
  transformer: { radius: 11, damage: 90, explosion: 'barrel', power: 1.1, score: 80, label: '引爆變壓器' },
};
