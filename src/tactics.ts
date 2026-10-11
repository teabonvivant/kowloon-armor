import { Vector3 } from 'three';
import type { Actor } from './actors';
import { blocked, wallFraction } from './math';
import type { Obstacle } from './render/world';

export type Tactic = 'advance' | 'flank' | 'cover' | 'retreat';
export interface TacticalGoal { readonly tactic: Tactic; readonly position: Vector3 }
const roads = [-168, -84, 0, 84, 168];
const junctions = roads.flatMap(x => roads.map(z => new Vector3(x, 0, z)));
const clearPath = (start: Vector3, end: Vector3, obstacles: readonly Obstacle[]): boolean =>
  wallFraction(start.x, start.z, end.x - start.x, end.z - start.z, obstacles) === 1;
const drivePath = (start: Vector3, end: Vector3, obstacles: readonly Obstacle[]): boolean =>
  wallFraction(start.x, start.z, end.x - start.x, end.z - start.z, obstacles, 2.3) === 1;

export function tacticalGoal(actor: Actor, player: Actor, obstacles: readonly Obstacle[], slot: number,
  enabled: boolean, canRetreat = true, canFlank = true): TacticalGoal {
  const position = actor.visual.root.position, target = player.visual.root.position;
  const distance = position.distanceTo(target);
  const available = junctions.filter(point => !blocked(point.x, point.z, obstacles));
  if (enabled && actor.hp < actor.maxHp * .3 && canRetreat) {
    const retreat = [...available].sort((left, right) => {
      const value = (point: Vector3): number => point.distanceTo(target) - point.distanceTo(position) * .65 + (clearPath(target, point, obstacles) ? 0 : 70);
      return value(right) - value(left);
    })[0];
    return { tactic: 'retreat', position: (retreat ?? position).clone() };
  }
  if (enabled && actor.cooldown > actor.reloadDuration * .5 && distance < 140) {
    const cover = available.filter(point => point.distanceTo(position) > 8 && point.distanceTo(position) < 115 && !clearPath(target, point, obstacles))
      .sort((left, right) => left.distanceTo(position) - right.distanceTo(position))[0];
    if (cover) return { tactic: 'cover', position: cover.clone() };
  }
  if (enabled && canFlank && slot % 3 !== 0 && distance > 65) {
    const side = slot % 2 ? -1 : 1;
    const flank = available.filter(point => (point.x - target.x) * side >= 60 && point.distanceTo(target) < 150)
      .sort((left, right) => left.distanceTo(position) + Math.abs(left.z - target.z) * .5 - right.distanceTo(position) - Math.abs(right.z - target.z) * .5)[0];
    if (flank) return { tactic: 'flank', position: flank.clone() };
  }
  return { tactic: 'advance', position: target.clone() };
}

interface RoadGraph { readonly distance: number[][]; readonly next: number[][] }
const graphs = new WeakMap<readonly Obstacle[], RoadGraph>();
function roadGraph(obstacles: readonly Obstacle[]): RoadGraph {
  const existing = graphs.get(obstacles); if (existing) return existing;
  const distance = junctions.map((from, start) => junctions.map((to, end) => start === end ? 0 :
    Math.abs(from.x - to.x) + Math.abs(from.z - to.z) === 84 && drivePath(from, to, obstacles) ? 84 : Infinity));
  const next = distance.map(row => row.map((cost, index) => Number.isFinite(cost) ? index : -1));
  for (let middle = 0; middle < junctions.length; middle++) for (let start = 0; start < junctions.length; start++) for (let end = 0; end < junctions.length; end++) {
    const via = (distance[start]?.[middle] ?? Infinity) + (distance[middle]?.[end] ?? Infinity);
    const row = distance[start], routes = next[start];
    if (row && routes && via < (row[end] ?? Infinity)) { row[end] = via; routes[end] = next[start]?.[middle] ?? -1; }
  }
  const graph = { distance, next }; graphs.set(obstacles, graph); return graph;
}

export function roadWaypoint(position: Vector3, target: Vector3, obstacles: readonly Obstacle[]): Vector3 {
  if (drivePath(position, target, obstacles)) return target.clone();
  const graph = roadGraph(obstacles);
  const starts = junctions.map((point, index) => ({ point, index, distance: point.distanceTo(position) }))
    .filter(item => drivePath(position, item.point, obstacles));
  const ends = junctions.map((point, index) => ({ point, index, distance: point.distanceTo(target) }))
    .filter(item => drivePath(target, item.point, obstacles));
  let best = Infinity, waypoint = position;
  for (const start of starts) for (const end of ends) {
    const distance = start.distance + (graph.distance[start.index]?.[end.index] ?? Infinity) + end.distance;
    if (distance >= best) continue;
    best = distance;
    waypoint = start.distance > 2 ? start.point : junctions[graph.next[start.index]?.[end.index] ?? -1] ?? end.point;
  }
  if (!Number.isFinite(best)) {
    const detours = [[6, 0], [-6, 0], [0, 6], [0, -6]].map(([offsetX, offsetZ]) =>
      new Vector3(position.x + (offsetX ?? 0), 0, position.z + (offsetZ ?? 0)));
    waypoint = detours.filter(point => !blocked(point.x, point.z, obstacles) && drivePath(position, point, obstacles))
      .sort((left, right) => left.distanceTo(target) - right.distanceTo(target))[0] ?? position;
  }
  return waypoint.clone();
}
