import { Vector3 } from 'three';
import type { Actor } from './actors';
import { impactArmor, intersectTank } from './armor';
import type { ArmorFace, HitZone } from './armor';
import { angleDelta, wallFraction } from './math';
import type { Obstacle } from './render/world';
import { LANDMARKS } from './render/hong-kong';
import { launchPose, obstacleFraction } from './ballistics';
import { REALISM_SAMPLE } from './realism';

export interface FireSolution { target?: Actor; zone?: HitZone; face?: ArmorFace; blocked: boolean; distance: number }
export function fireSolution(player: Actor, enemies: readonly Actor[], obstacles: readonly Obstacle[]): FireSolution {
  const position = player.visual.root.position;
  const direction = new Vector3(-Math.sin(player.aim) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.aim) * Math.cos(player.pitch));
  const start = position.clone().add(new Vector3(0, 2.5, 0));
  let offset = 5.5;
  if (REALISM_SAMPLE) {
    const pose = launchPose(player), delta = pose.origin.clone().sub(pose.breech);
    const clearance = obstacleFraction(pose.breech,delta,obstacles);
    if (clearance < 1) return { blocked: true, distance: clearance * delta.length() };
    direction.copy(pose.direction); start.copy(pose.origin); offset = pose.origin.distanceTo(position);
  } else {
    const muzzle = wallFraction(start.x, start.z, direction.x * 5.5, direction.z * 5.5, obstacles);
    if (muzzle < 1) return { blocked: true, distance: muzzle * 5.5 };
    start.addScaledVector(direction, 5.5);
  }
  const delta = direction.clone().multiplyScalar(560);
  let nearest = REALISM_SAMPLE ? obstacleFraction(start,delta,obstacles) : wallFraction(start.x, start.z, delta.x, delta.z, obstacles);
  if (delta.y < 0) nearest = Math.min(nearest, Math.max(0, (.2 - start.y) / delta.y));
  let solution: FireSolution = { blocked: nearest < 1, distance: nearest * 560 + offset };
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const hit = intersectTank(enemy, start, delta);
    if (hit && hit.fraction < nearest) {
      nearest = hit.fraction;
      solution = { target: enemy, zone: hit.zone, face: impactArmor(enemy, hit.zone, direction).face, blocked: false, distance: nearest * 560 + offset };
    }
  }
  return solution;
}

export function imminentThreats(player: Actor, enemies: readonly Actor[], obstacles: readonly Obstacle[]): number {
  const position = player.visual.root.position;
  return enemies.filter(enemy => {
    const source = enemy.visual.root.position;
    const horizontal = position.x - source.x, vertical = position.z - source.z;
    return enemy.alive && enemy.cooldown <= 1 && Math.hypot(horizontal, vertical) < 200 &&
      Math.abs(angleDelta(enemy.aim, Math.atan2(-horizontal, -vertical))) < .045 &&
      wallFraction(source.x, source.z, horizontal, vertical, obstacles) === 1;
  }).length;
}

const stops = [[126, 168], [-42, 84], [-42, 0], [42, -84], [-126, -84], [-168, 126]] as const;
export const TOUR_STOPS = LANDMARKS.map((landmark, index) => ({ name: landmark.name, x: stops[index]![0], z: stops[index]![1] }));
export class LandmarkTour {
  active = false; dwell = 0; readonly visited = new Set<string>();
  get destination(): typeof TOUR_STOPS[number] | undefined { return this.active ? TOUR_STOPS.find(stop => !this.visited.has(stop.name)) : undefined; }
  update(player: Actor, dt: number): string | undefined {
    const stop = this.destination, position = player.visual.root.position;
    if (!stop || Math.hypot(position.x - stop.x, position.z - stop.z) > 10 || Math.abs(player.speed) >= .4) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 2) return;
    this.visited.add(stop.name); this.dwell = 0; return stop.name;
  }
}

export function navigationHint(player: Actor, x: number, z: number): string {
  const position = player.visual.root.position;
  const distance = Math.hypot(x - position.x, z - position.z);
  const angle = -angleDelta(player.aim, Math.atan2(-(x - position.x), -(z - position.z))) * 180 / Math.PI;
  const direction = Math.abs(angle) > 150 ? '後方' : Math.abs(angle) < 15 ? '前方' : angle > 0 ? `右 ${Math.round(angle)}°` : `左 ${Math.round(-angle)}°`;
  return `${Math.round(distance)} m · 炮塔${direction}`;
}
