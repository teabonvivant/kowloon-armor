import type { Game } from '../src/game';
import type { InputFrame } from '../src/input';
import { angleDelta, clamp, wallFraction } from '../src/math';
import { roadWaypoint } from '../src/tactics';
import { Vector3 } from 'three';

export function pilotInput(game: Game, defenceOffset: readonly [number, number] = [0, 16]): InputFrame {
  const player = game.player, position = player.visual.root.position;
  const goal = game.mode === 'campaign' ? game.mission?.objective : undefined;
  const zone = goal && goal.kind !== 'clear' ? new Vector3(goal.center[0], 0, goal.center[1]) : null;
  const enemies = game.enemies.filter(enemy => enemy.alive);
  const visible = enemies.filter(enemy => {
    const target = enemy.visual.root.position;
    return wallFraction(position.x, position.z, target.x - position.x, target.z - position.z, game.world.obstacles) === 1;
  });
  const target = (visible.length ? visible : enemies).sort((left, right) =>
    (zone && goal?.kind === 'defend' ? Number(right.visual.root.position.distanceTo(zone) < goal.radius) - Number(left.visual.root.position.distanceTo(zone) < goal.radius) : 0) ||
    left.hp - right.hp || left.visual.root.position.distanceTo(position) - right.visual.root.position.distanceTo(position))[0];
  const targetPosition = target?.visual.root.position;
  const distance = targetPosition?.distanceTo(position) ?? Infinity;
  const aim = targetPosition ? Math.atan2(-(targetPosition.x - position.x), -(targetPosition.z - position.z)) : player.aim;
  const traverse = clamp(63 / player.spec.weight, .8, 1.4);
  const aimX = clamp(-angleDelta(player.aim, aim) / (1 / 60 * 1.1 * traverse), -1, 1);
  let destination: Vector3 | undefined;
  if (zone && goal?.kind === 'defend') {
    const station = zone.clone().add(new Vector3(defenceOffset[0], 0, defenceOffset[1]));
    if (position.distanceTo(station) > 3) destination = station;
  } else if (target && (!visible.includes(target) || distance > 135)) destination = target.visual.root.position;
  else if (!target && zone && position.distanceTo(zone) > (goal?.kind !== 'clear' ? goal?.radius ?? 24 : 24) - 3) destination = zone;
  const waypoint = destination ? roadWaypoint(position, destination, game.world.obstacles) : null;
  const wanted = waypoint ? Math.atan2(-(waypoint.x - position.x), -(waypoint.z - position.z)) : player.yaw;
  const turn = angleDelta(player.yaw, wanted);
  const throttle = waypoint && Math.abs(turn) < .4 ? .65 : 0;
  return { throttle, steer: waypoint ? clamp(-turn * 2.5, -1, 1) : 0,
    aimX, aimY: clamp(-player.pitch / (1 / 60 * .45), -1, 1),
    brake: !throttle, fire: !!target && visible.includes(target) && distance < 185 && Math.abs(angleDelta(player.aim, aim)) < .035,
    scope: false, toggleCamera: false, pause: false };
}
