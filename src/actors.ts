import { Vector3 } from 'three';
import type { TankSpec } from './data/tanks';
import type { InputFrame } from './input';
import { angleDelta, blocked, clamp, forward, wallFraction } from './math';
import { createTank, rotateWheels } from './render/tank';
import type { TankVisual } from './render/tank';
import type { Obstacle } from './render/world';

export interface Actor {
  readonly spec: TankSpec; readonly visual: TankVisual; readonly enemy: boolean;
  hp: number; maxHp: number; speed: number; yaw: number; aim: number; pitch: number;
  cooldown: number; alive: boolean; waypoint: Vector3; stuck: number;
}
export function createActor(spec: TankSpec, x: number, z: number, enemy = false): Actor {
  const visual = createTank(spec);
  visual.root.position.set(x, 0, z);
  const maxHp = enemy ? Math.round(spec.hp * 0.5) : spec.hp;
  return { spec, visual, enemy, hp: maxHp, maxHp, speed: 0, yaw: enemy ? Math.PI : 0,
    aim: enemy ? Math.PI : 0, pitch: 0, cooldown: enemy ? 4 : 0,
    alive: true, waypoint: new Vector3(x, 0, z), stuck: 0 };
}
export function moveActor(actor: Actor, throttle: number, steer: number, brake: boolean,
  dt: number, obstacles: readonly Obstacle[], actors: readonly Actor[]): void {
  const target = throttle * (throttle >= 0 ? actor.spec.speed : actor.spec.reverse) / 3.6;
  const acceleration = brake ? 26 : Math.abs(throttle) < 0.04 ? 5 : 6;
  actor.speed += clamp((brake ? 0 : target) - actor.speed, -acceleration * dt, acceleration * dt);
  actor.yaw -= steer * (0.7 + Math.min(Math.abs(actor.speed) / 15, 0.35)) * dt;
  const [fx, fz] = forward(actor.yaw);
  const p = actor.visual.root.position;
  const x = p.x + fx * actor.speed * dt, z = p.z + fz * actor.speed * dt;
  const occupied = actors.some(other => other !== actor && other.alive &&
    Math.hypot(other.visual.root.position.x - x, other.visual.root.position.z - z) < 4.7);
  if (!blocked(x, z, obstacles) && !occupied) { p.x = x; p.z = z; actor.stuck = 0; }
  else { actor.speed *= 0.3; actor.stuck += dt; }
  actor.visual.root.rotation.y = actor.yaw;
  actor.visual.turret.rotation.y = actor.aim - actor.yaw;
  actor.visual.barrel.rotation.x = actor.pitch;
  actor.visual.recoil = Math.max(0, actor.visual.recoil - dt * 1.8);
  actor.visual.barrel.position.z = -1.42 + actor.visual.recoil;
  rotateWheels(actor.visual, actor.speed * dt);
  actor.cooldown = Math.max(0, actor.cooldown - dt);
}
export function drivePlayer(actor: Actor, input: InputFrame, dt: number,
  obstacles: readonly Obstacle[], actors: readonly Actor[]): void {
  actor.aim -= input.aimX * dt * (input.scope ? 0.35 : 1.1);
  actor.pitch = clamp(actor.pitch + input.aimY * dt * 0.45, -0.12, 0.32);
  moveActor(actor, input.throttle, input.steer, input.brake, dt, obstacles, actors);
}
const ROADS = [-168, -84, 0, 84, 168] as const;
export function advanceEnemy(actor: Actor, player: Actor, dt: number,
  obstacles: readonly Obstacle[], actors: readonly Actor[]): void {
  const position = actor.visual.root.position;
  const target = player.visual.root.position;
  const aim = Math.atan2(-(target.x - position.x), -(target.z - position.z));
  actor.aim += clamp(angleDelta(actor.aim, aim), -0.65 * dt, 0.65 * dt);
  actor.pitch = 0;
  const distance = position.distanceTo(target);
  if (position.distanceTo(actor.waypoint) < 7 || actor.stuck > 1) {
    const gx = ROADS.reduce<number>((near, val) => Math.abs(val - position.x) < Math.abs(near - position.x) ? val : near, 0);
    const gz = ROADS.reduce<number>((near, val) => Math.abs(val - position.z) < Math.abs(near - position.z) ? val : near, 0);
    const candidates = [new Vector3(gx + 84, 0, gz), new Vector3(gx - 84, 0, gz),
      new Vector3(gx, 0, gz + 84), new Vector3(gx, 0, gz - 84)]
      .filter(point => Math.abs(point.x) <= 168 && Math.abs(point.z) <= 168);
    candidates.sort((a, b) => a.distanceTo(target) - b.distanceTo(target));
    actor.waypoint.copy(candidates[actor.stuck > 1 ? 1 : 0] ?? target);
  }
  const wanted = Math.atan2(-(actor.waypoint.x - position.x), -(actor.waypoint.z - position.z));
  const turn = angleDelta(actor.yaw, wanted);
  const clear = wallFraction(position.x, position.z, target.x - position.x, target.z - position.z, obstacles) === 1;
  const throttle = distance < 55 && clear ? 0 : Math.abs(turn) > 0.7 ? 0.15 : 0.42;
  moveActor(actor, throttle, clamp(-turn * 2, -1, 1), false, dt, obstacles, actors);
}
