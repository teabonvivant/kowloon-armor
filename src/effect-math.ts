import { Vector3 } from 'three';
import { clamp } from './math';
import type { Obstacle } from './render/world';
import type { Actor } from './actors';
import type { HitZone, ArmorFace } from './armor';
import type { ExplosionKind, ImpactGrade } from './game-events-v19';
import { FAMILY_SHAPES } from './render/geo-tank';

export type ImpactKind = 'armor' | 'track' | 'road' | 'building' | 'metal';
export interface EffectOptions { quality: 'low' | 'medium' | 'high'; mobile: boolean; reducedMotion: boolean; lowFlash: boolean }
export const DEFAULT_EFFECTS: EffectOptions = { quality: 'medium', mobile: false, reducedMotion: false, lowFlash: false };
export function gunProfile(calibre: number, weight = 60): { stroke: number; length: number; force: number; duration: number } {
  const bore = clamp(Number.isFinite(calibre) ? calibre : 120, 90, 155) / 120;
  const mass = clamp(Number.isFinite(weight) ? weight : 60, 35, 80);
  return { stroke: .42 * bore, length: 2.8 * bore, force: clamp(bore * 60 / mass, .6, 1.6), duration: .11 * Math.sqrt(bore) };
}
export function recoilEnvelope(age: number): number {
  if (age <= 0 || age >= .7) return 0;
  if (age < .045) return Math.sin(age / .045 * Math.PI / 2);
  const t = (age - .045) / .655;
  return (1 - t) ** 2 * (1 + 2 * t);
}
export function flashEnvelope(age: number): number {
  if (age < 0 || age >= .14) return 0;
  return age < .018 ? .65 + .35 * age / .018 : Math.exp(-(age - .018) * 35) * (1 - (age - .018) / .122);
}
export function particleEnvelope(age: number, life: number): number {
  if (life <= 0 || age <= 0 || age >= life) return 0;
  return Math.min(1, age / Math.min(.09, life * .15)) * Math.min(1, (life - age) / (life * .65));
}
export function cameraKick(age: number, mode: string, scope: boolean, zoom: number, strength: number, reduced: boolean): number {
  if (reduced || age < 0 || age >= .65) return 0;
  const factor = scope ? .12 / Math.max(1, zoom) : mode === 'gunner' ? .14 : mode === 'driver' ? .35 : 1;
  return Math.sin(age * 32) * Math.exp(-age * 10) * .16 * factor * clamp(strength, 0, 1);
}
export const tracerLength = (speed: number, elapsed: number): number => Math.max(0, Math.min(4, speed * Math.min(.018, elapsed)));
export const groundContact = (height: number, verticalStep: number): number => verticalStep < 0 ? clamp((.2 - height) / verticalStep, 0, 1) : 1;
export interface EffectCapacity { smoke: number; sparks: number; debris: number; marks: number; flash: number; dust: number; fire: number; glow: number }
/** Live pool limits. v1.9 raises medium/high only; low and touch keep the v1.8 values (monotonic, see M08). */
export function effectBudget(quality: string, mobile: boolean): EffectCapacity {
  const level = mobile || quality === 'low' ? 0 : quality === 'high' ? 2 : 1;
  return { smoke: [48, 104, 160][level] ?? 48, sparks: [32, 72, 128][level] ?? 32,
    debris: [16, 56, 96][level] ?? 16, marks: [16, 32, 48][level] ?? 16,
    flash: [12, 28, 48][level] ?? 12, dust: [32, 64, 96][level] ?? 32,
    fire: [8, 16, 24][level] ?? 8, glow: [12, 12, 16][level] ?? 12 };
}
/** Physical pool sizes (the largest limit of any tier). */
export const EFFECT_CAPACITY: Readonly<EffectCapacity> = effectBudget('high', false);

export interface ExplosionProfile {
  fire: number; fireColor: number; smokeColor: number; smokeLife: number; debris: number; debrisColor: number;
  sparks: number; flash: number; dust: number; radius: number; burn: number; heat: number;
}
/** Per-kind look of the dedicated explosion. `radius` matches PROP_TABLE; multipliers are applied to the power-scaled base. */
export const EXPLOSION_PROFILES: Readonly<Record<ExplosionKind, ExplosionProfile>> = {
  barrel: { fire: .9, fireColor: 0xff9a3a, smokeColor: 0x3a3b39, smokeLife: 1, debris: 1, debrisColor: 0x4a4a42, sparks: 1, flash: 0, dust: 1, radius: 11, burn: 0, heat: .8 },
  lpg: { fire: 1.25, fireColor: 0xffb347, smokeColor: 0x5a5750, smokeLife: .8, debris: .85, debrisColor: 0x6a6a64, sparks: .8, flash: 1, dust: 1, radius: 11, burn: 0, heat: 1 },
  vehicle: { fire: 1.05, fireColor: 0xff8a2e, smokeColor: 0x1f201f, smokeLife: 1.15, debris: 1.2, debrisColor: 0x42463f, sparks: 1.1, flash: 0, dust: 1, radius: 14, burn: 4, heat: 1 },
  tanker: { fire: 1.6, fireColor: 0xff7a24, smokeColor: 0x1a1b1a, smokeLife: 1.3, debris: 1, debrisColor: 0x55564f, sparks: 1, flash: 1, dust: 1, radius: 18, burn: 6, heat: 1.2 },
  ammo: { fire: .8, fireColor: 0xffd27a, smokeColor: 0x5b5a55, smokeLife: .9, debris: 1, debrisColor: 0x3b3e38, sparks: 2.4, flash: 2, dust: 1, radius: 8, burn: 0, heat: 1 },
  strike: { fire: .75, fireColor: 0xffc062, smokeColor: 0x6f6a5c, smokeLife: .95, debris: 1.3, debrisColor: 0x5a5240, sparks: .7, flash: 0, dust: 1.3, radius: 12, burn: 0, heat: .9 },
};
export interface ExplosionPlan { fire: number; flash: number; smoke: number; debris: number; sparks: number; dust: number; marks: number; glow: number; burn: number }
/**
 * Emission counts of one explosion. Quality tier: low/touch 0.4, medium 1, high 1.3 (clamped to the C02 ranges);
 * distance: >70 m 0.75, >140 m 0.5, >260 m none. `power` is clamped to 0.5-2.
 */
export function explosionPlan(kind: ExplosionKind, power: number, quality: string, mobile: boolean, distance = 0): ExplosionPlan {
  const u = (clamp(Number.isFinite(power) ? power : 1, .5, 2) - .5) / 1.5, profile = EXPLOSION_PROFILES[kind];
  const tier = mobile || quality === 'low' ? .4 : quality === 'high' ? 1.3 : 1;
  const far = distance > 260 ? 0 : distance > 140 ? .5 : distance > 70 ? .75 : 1;
  if (far === 0) return { fire: 0, flash: 0, smoke: 0, debris: 0, sparks: 0, dust: 0, marks: 0, glow: 0, burn: 0 };
  const lerp = (a: number, b: number) => a + (b - a) * u, count = (n: number, max: number) => Math.min(max, Math.floor(n * tier * far));
  return {
    fire: count(Math.round(lerp(6, 8)), 8), flash: count(Math.round(lerp(6, 9)) + profile.flash, 11),
    smoke: count(Math.round(lerp(12, 16)), 16), debris: count(Math.max(12, Math.round(lerp(12, 20) * profile.debris)), 20),
    sparks: count(Math.round(lerp(6, 10) * profile.sparks), 24), dust: count(Math.round(12 * profile.dust), 16),
    marks: count(3, 4), glow: count(3, 4), burn: tier > .4 && profile.burn > 0 ? 2 : 0,
  };
}
/** Scorch size (m, 3-5) of the ground mark. */
export const scorchSize = (power: number): number => 3 + (clamp(Number.isFinite(power) ? power : 1, .5, 2) - .5) / 1.5 * 2;

/** Armour contact grade; presentation only, never feeds damage. `cosIncidence` = -v̂·n̂ on the struck surface. */
export interface ImpactGradeInput { target: boolean; cosIncidence: number; factor?: number | undefined; face?: ArmorFace | undefined; destroyed?: boolean | undefined }
export const GRADE_LIMITS = { ricochetCos: .34, frontBlockedCos: .5, penetrateFactor: .8 } as const;
export function impactGrade(input: ImpactGradeInput): ImpactGrade {
  const cos = clamp(Number.isFinite(input.cosIncidence) ? input.cosIncidence : 1, -1, 1);
  if (!input.target) return cos < GRADE_LIMITS.ricochetCos ? 'ricochet' : 'blocked';
  if (input.destroyed) return 'penetrate';
  if (cos < GRADE_LIMITS.ricochetCos) return 'ricochet';
  if ((input.factor ?? 1) < GRADE_LIMITS.penetrateFactor) return 'blocked';
  if (input.face === 'front' && cos < GRADE_LIMITS.frontBlockedCos) return 'blocked';
  return 'penetrate';
}
/** Deterministic ammo-rack cook-off (about 50 %), only for a turret-ring / rear strike. */
export type CookOffZone = HitZone | 'turretRing' | 'rear';
export function shouldCookOff(seed: number, enemyIndex: number, zone: CookOffZone, face?: ArmorFace): boolean {
  const eligible = zone === 'turret' || zone === 'turretRing' || zone === 'rear' || (zone === 'hull' && face === 'rear');
  if (!eligible) return false;
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((enemyIndex | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return ((h >>> 0) & 1023) < 512;
}
/** v1.9 tracer length: <=6 m at >=120 m/s (4 m below), never longer than the distance flown, ~32 ms of travel. */
export function tracerLengthV19(speed: number, flown: number): number {
  const cap = speed >= 120 ? 6 : 4;
  return Math.max(0, Math.min(cap, flown, speed * .032));
}
export function effectPathClear(start: Vector3, end: Vector3, radius: number, obstacles: readonly Obstacle[]): boolean {
  const margin = Math.max(0, radius);
  for (const box of obstacles) {
    let enter = 0, exit = 1;
    const axes = [[start.x,end.x - start.x,box.x - box.halfX - margin,box.x + box.halfX + margin],
      [start.z,end.z - start.z,box.z - box.halfZ - margin,box.z + box.halfZ + margin]];
    if (box.height !== undefined) axes.push([start.y,end.y - start.y,-margin,box.height + margin]);
    for (const [origin = 0, travel = 0, low = 0, high = 0] of axes) {
      if (Math.abs(travel) < 1e-8) { if (origin < low || origin > high) { exit = -1; break; } }
      else {
        const near = (low - origin) / travel, far = (high - origin) / travel;
        enter = Math.max(enter, Math.min(near, far)); exit = Math.min(exit, Math.max(near, far));
      }
    }
    if (enter <= exit) return false;
  }
  return true;
}
export function wallNormal(point: Vector3, obstacles: readonly Obstacle[], incoming: Vector3): Vector3 {
  let distance = Infinity; const normal = incoming.clone().negate().normalize();
  for (const box of obstacles) {
    if (Math.abs(point.x - box.x) > box.halfX + .01 || Math.abs(point.z - box.z) > box.halfZ + .01) continue;
    for (const side of [-1, 1]) {
      const x = Math.abs(point.x - box.x - side * box.halfX), z = Math.abs(point.z - box.z - side * box.halfZ);
      if (x < distance) { distance = x; normal.set(side, 0, 0); }
      if (z < distance) { distance = z; normal.set(0, 0, side); }
    }
  }
  return normal;
}
export function wallKind(point: Vector3, obstacles: readonly Obstacle[]): ImpactKind {
  return obstacles.find(box => Math.abs(point.x - box.x) <= box.halfX + .01 && Math.abs(point.z - box.z) <= box.halfZ + .01)?.surface ?? 'building';
}
export function impactDirection(incoming: Vector3, normal: Vector3): Vector3 {
  return incoming.clone().normalize().reflect(normal).normalize();
}
export function armorNormal(actor: Actor, zone: HitZone, point: Vector3): Vector3 {
  const shape = FAMILY_SHAPES[actor.spec.family], origin = actor.visual.root.position;
  const c = Math.cos(actor.yaw), s = Math.sin(actor.yaw), x = point.x - origin.x, z = point.z - origin.z;
  const local = new Vector3(x * c - z * s, point.y - origin.y, (x * s + z * c) / shape.lengthScale);
  let yaw = actor.yaw, bounds = [-1.65, .95, -3.3, 1.65, 2.05, 3.35];
  if (zone === 'turret') {
    local.z -= shape.turretZ; local.applyAxisAngle(new Vector3(0, 1, 0), -(actor.aim - actor.yaw));
    yaw = actor.aim; bounds = [-1.62, 2.05, -1.78, 1.62, 3.12, 1.85];
  } else if (zone.endsWith('Track')) bounds = zone === 'leftTrack' ? [-2.1, .12, -3.25, -1.38, 1.4, 3.25] : [1.38, .12, -3.25, 2.1, 1.4, 3.25];
  const coordinates = local.toArray(); let nearest = Infinity; const result = new Vector3();
  for (let axis = 0; axis < 3; axis++) for (let side = 0; side < 2; side++) {
    const distance = Math.abs((coordinates[axis] ?? 0) - (bounds[axis + side * 3] ?? 0));
    if (distance < nearest) { nearest = distance; result.set(0, 0, 0).setComponent(axis, side ? 1 : -1); }
  }
  return result.applyAxisAngle(new Vector3(0, 1, 0), yaw);
}
