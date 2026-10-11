import type { Vector3 } from 'three';
import type { Actor } from './actors';
import { angleDelta } from './math';
import { FAMILY_SHAPES } from './render/geo-tank';

export type HitZone = 'hull' | 'turret' | 'leftTrack' | 'rightTrack';
export type ArmorFace = 'front' | 'side' | 'rear';
export interface TankIntersection { readonly fraction: number; readonly zone: HitZone }
export interface Impact {
  readonly zone: HitZone; readonly face: ArmorFace;
  readonly bearing: number; readonly position: Vector3;
}
export const ZONE_NAMES: Record<HitZone, string> = { hull: '車體', turret: '炮塔', leftTrack: '左履帶', rightTrack: '右履帶' };
export const FACE_NAMES: Record<ArmorFace, string> = { front: '正面', side: '側面', rear: '後方' };

function boxFraction(start: readonly number[], delta: readonly number[], minimum: readonly number[], maximum: readonly number[]): number | null {
  let enter = 0, exit = 1;
  for (let axis = 0; axis < 3; axis++) {
    const origin = start[axis] ?? 0, travel = delta[axis] ?? 0;
    const low = minimum[axis] ?? 0, high = maximum[axis] ?? 0;
    if (Math.abs(travel) < 1e-8) {
      if (origin < low || origin > high) return null;
    } else {
      const near = (low - origin) / travel, far = (high - origin) / travel;
      enter = Math.max(enter, Math.min(near, far)); exit = Math.min(exit, Math.max(near, far));
      if (enter > exit) return null;
    }
  }
  return enter <= 1 && exit >= 0 ? enter : null;
}

export function intersectTank(actor: Actor, start: Vector3, delta: Vector3): TankIntersection | null {
  const position = actor.visual.root.position, shape = FAMILY_SHAPES[actor.spec.family];
  const cosine = Math.cos(actor.yaw), sine = Math.sin(actor.yaw);
  const offsetX = start.x - position.x, offsetZ = start.z - position.z;
  const localX = offsetX * cosine - offsetZ * sine;
  const localZ = (offsetX * sine + offsetZ * cosine) / shape.lengthScale;
  const travelX = delta.x * cosine - delta.z * sine;
  const travelZ = (delta.x * sine + delta.z * cosine) / shape.lengthScale;
  const localY = start.y - position.y;
  const turretYaw = actor.aim - actor.yaw;
  const turretCosine = Math.cos(turretYaw), turretSine = Math.sin(turretYaw);
  const turretZ = localZ - shape.turretZ;
  const turretStart = [localX * turretCosine - turretZ * turretSine, localY, localX * turretSine + turretZ * turretCosine];
  const turretTravel = [travelX * turretCosine - travelZ * turretSine, delta.y, travelX * turretSine + travelZ * turretCosine];
  const candidates: readonly [HitZone, number | null][] = [
    ['hull', boxFraction([localX, localY, localZ], [travelX, delta.y, travelZ], [-1.65, .95, -3.3], [1.65, 2.05, 3.35])],
    ['turret', boxFraction(turretStart, turretTravel, [-1.62, 2.05, -1.78], [1.62, 3.12, 1.85])],
    ['leftTrack', boxFraction([localX, localY, localZ], [travelX, delta.y, travelZ], [-2.1, .12, -3.25], [-1.38, 1.4, 3.25])],
    ['rightTrack', boxFraction([localX, localY, localZ], [travelX, delta.y, travelZ], [1.38, .12, -3.25], [2.1, 1.4, 3.25])],
  ];
  let nearest: TankIntersection | null = null;
  for (const [zone, fraction] of candidates) {
    if (fraction !== null && (!nearest || fraction < nearest.fraction)) nearest = { fraction, zone };
  }
  return nearest;
}

export function impactArmor(actor: Actor, zone: HitZone, velocity: Vector3): { face: ArmorFace; factor: number; bearing: number } {
  const bearing = Math.atan2(velocity.x, velocity.z);
  const aspect = Math.abs(angleDelta(zone === 'turret' ? actor.aim : actor.yaw, bearing));
  const face: ArmorFace = aspect < .7 ? 'front' : aspect > 2.4 ? 'rear' : 'side';
  const factor = (face === 'front' ? .85 : face === 'rear' ? 1.5 : 1.15) * (zone.endsWith('Track') ? .42 : zone === 'turret' ? .95 : 1);
  return { face, factor, bearing };
}
