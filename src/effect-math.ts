import { Vector3 } from 'three';
import { clamp } from './math';
import type { Obstacle } from './render/world';
import type { Actor } from './actors';
import type { HitZone } from './armor';
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
export function effectBudget(quality: string, mobile: boolean): { smoke: number; sparks: number; debris: number; marks: number; flash: number; dust: number } {
  const level = mobile || quality === 'low' ? 0 : quality === 'high' ? 2 : 1;
  return { smoke: [48, 88, 128][level] ?? 48, sparks: [32, 72, 128][level] ?? 32,
    debris: [16, 40, 64][level] ?? 16, marks: [16, 32, 48][level] ?? 16,
    flash: [12, 20, 32][level] ?? 12, dust: [32, 64, 96][level] ?? 32 };
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
