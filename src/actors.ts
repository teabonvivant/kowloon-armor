import { Vector3 } from 'three';
import type { TankSpec } from './data/tanks';
import type { InputFrame } from './input';
import { angleDelta, blocked, clamp, forward, wallFraction } from './math';
import { createTank, rotateWheels, updateTankMotion } from './render/tank';
import type { TankVisual } from './render/tank';
import type { Obstacle } from './render/world';
import { roadWaypoint, tacticalGoal } from './tactics';
import type { Tactic } from './tactics';
import type { Difficulty } from './challenges';
import { addEnemyDetails, enemyRole } from './render/enemy-details';
import type { EnemyRole } from './render/enemy-details';

export interface Actor {
  readonly role: EnemyRole;
  readonly spec: TankSpec; readonly visual: TankVisual; readonly enemy: boolean;
  hp: number; maxHp: number; speed: number; yaw: number; aim: number; pitch: number;
  cooldown: number; alive: boolean; waypoint: Vector3; stuck: number;
  leftTrack: number; rightTrack: number; rapidShots: number; reloadDuration: number;
  tactic: Tactic; think: number; aiAge: number; nextRetreat: number; retreatUntil: number; nextFlank: number;
  reducedMotion: boolean;
}
export function createActor(spec: TankSpec, x: number, z: number, enemy = false): Actor {
  const visual = createTank(spec);
  const role = enemyRole(spec);
  if (enemy) addEnemyDetails(visual, role);
  visual.root.position.set(x, 0, z);
  const maxHp = enemy ? Math.round(spec.hp * 0.5) : spec.hp;
  return { spec, visual, enemy, role, hp: maxHp, maxHp, speed: 0, yaw: enemy ? Math.PI : 0,
    aim: enemy ? Math.PI : 0, pitch: 0, cooldown: enemy ? 4 : 0,
    alive: true, waypoint: new Vector3(x, 0, z), stuck: 0,
    leftTrack: 0, rightTrack: 0, rapidShots: 0, reloadDuration: spec.reload,
    tactic: 'advance', think: 0, aiAge: 0, nextRetreat: 0, retreatUntil: 0, nextFlank: 0, reducedMotion: false };
}
export function moveActor(actor: Actor, throttle: number, steer: number, brake: boolean,
  dt: number, obstacles: readonly Obstacle[], actors: readonly Actor[]): void {
  const mobility = actor.leftTrack > 0 && actor.rightTrack > 0 ? .14 : actor.leftTrack > 0 || actor.rightTrack > 0 ? .28 : 1;
  const agility = clamp(63 / actor.spec.weight, .8, 1.5);
  const previousYaw = actor.yaw;
  const previousSpeed = actor.speed;
  const target = throttle * (throttle >= 0 ? actor.spec.speed : actor.spec.reverse) / 3.6 * mobility;
  const acceleration = brake ? 26 * Math.sqrt(agility) : Math.abs(throttle) < 0.04 ? 5 : 6 * agility * Math.sqrt(mobility);
  actor.speed += clamp((brake ? 0 : target) - actor.speed, -acceleration * dt, acceleration * dt);
  actor.yaw -= steer * (0.7 + Math.min(Math.abs(actor.speed) / 15, 0.35)) * Math.sqrt(agility) * Math.sqrt(mobility) * dt;
  if (Math.abs(actor.speed) < .4 && (brake || Math.abs(throttle) < .04)) {
    actor.leftTrack = Math.max(0, actor.leftTrack - dt); actor.rightTrack = Math.max(0, actor.rightTrack - dt);
  }
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
  updateTankMotion(actor.visual, dt, actor.pitch, dt > 0 ? (actor.speed - previousSpeed) / dt : 0, actor.reducedMotion);
  const pivotTravel = (actor.yaw - previousYaw) * 1.73;
  rotateWheels(actor.visual, actor.leftTrack > 0 ? 0 : actor.speed * dt - pivotTravel,
    actor.rightTrack > 0 ? 0 : actor.speed * dt + pivotTravel);
  actor.cooldown = Math.max(0, actor.cooldown - dt);
}
export function drivePlayer(actor: Actor, input: InputFrame, dt: number,
  obstacles: readonly Obstacle[], actors: readonly Actor[]): void {
  const traverse = clamp(63 / actor.spec.weight, .8, 1.4);
  actor.aim -= (input.aimX * dt * 1.1 * traverse + (input.pointerX ?? 0)) * (input.scope ? .35 : 1);
  actor.pitch = clamp(actor.pitch + (input.aimY * dt * .45 + (input.pointerY ?? 0)) * (input.scope ? .35 : 1), -0.12, 0.32);
  moveActor(actor, input.throttle, input.steer, input.brake, dt, obstacles, actors);
}
interface EnemyOrders { readonly slot?: number; readonly difficulty?: Difficulty; readonly tactical?: boolean; readonly objective?: Vector3 }
export function advanceEnemy(actor: Actor, player: Actor, dt: number,
  obstacles: readonly Obstacle[], actors: readonly Actor[], orders: EnemyOrders = {}): void {
  const position = actor.visual.root.position;
  const target = player.visual.root.position;
  const aim = Math.atan2(-(target.x - position.x), -(target.z - position.z));
  const response = orders.difficulty === 'veteran' ? .9 : orders.difficulty === 'training' ? .45 : .65;
  actor.aim += clamp(angleDelta(actor.aim, aim), -response * dt, response * dt);
  actor.pitch = 0;
  const distance = position.distanceTo(target);
  actor.aiAge += dt; actor.think -= dt;
  if (actor.tactic === 'flank' && position.distanceTo(actor.waypoint) < 5) actor.nextFlank = actor.aiAge + 10;
  if (actor.hp < actor.maxHp * .3 && actor.aiAge >= actor.nextRetreat) {
    actor.retreatUntil = actor.aiAge + 4; actor.nextRetreat = actor.aiAge + 14;
  }
  if (actor.think <= 0) {
    const goal = tacticalGoal(actor, player, obstacles, orders.slot ?? 0, orders.tactical ?? true, actor.aiAge < actor.retreatUntil, actor.aiAge >= actor.nextFlank);
    actor.tactic = goal.tactic;
    const destination = orders.objective && goal.tactic === 'advance' ? orders.objective : goal.position;
    actor.waypoint.copy(roadWaypoint(position, destination, obstacles));
    actor.think = orders.difficulty === 'veteran' ? .4 : orders.difficulty === 'training' ? 1.1 : .75;
    if (actor.stuck > 1) {
      const side = (orders.slot ?? 0) % 2 ? -1 : 1;
      const detour = new Vector3(position.x + Math.cos(actor.yaw) * side * 5, 0, position.z - Math.sin(actor.yaw) * side * 5);
      if (!blocked(detour.x, detour.z, obstacles)) actor.waypoint.copy(detour);
    }
  }
  const wanted = Math.atan2(-(actor.waypoint.x - position.x), -(actor.waypoint.z - position.z));
  const turn = angleDelta(actor.yaw, wanted);
  const clear = wallFraction(position.x, position.z, target.x - position.x, target.z - position.z, obstacles) === 1;
  const atGoal = position.distanceTo(actor.waypoint) < 1.5;
  const holding = actor.tactic === 'advance' && (orders.objective ? position.distanceTo(orders.objective) < 12 : distance < 55 && clear);
  const repairing = actor.leftTrack > 0 && actor.rightTrack > 0;
  const throttle = holding || atGoal || repairing ? 0 : Math.abs(turn) > .8 ? .12 : actor.tactic === 'retreat' ? .65 : .48;
  moveActor(actor, throttle, holding || atGoal || repairing ? 0 : clamp(-turn * 2, -1, 1), holding || repairing, dt, obstacles, actors);
}
