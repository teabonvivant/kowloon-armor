import { Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { Actor } from './actors';
import type { TankSpec } from './data/tanks';
import { REALISM_SAMPLE } from './realism';
import { muzzleDirection, muzzlePosition } from './render/tank';
import type { Obstacle } from './render/world';

export interface WeaponProfile { readonly id: string; readonly velocity: number; readonly gravity: number; readonly provenance: string }
const leopard: WeaponProfile = {
  id: 'L55 / DM63A1', velocity: 1720, gravity: 9.81,
  provenance: 'https://www.rheinmetall.com/Rheinmetall%20Group/brochure-download/Weapon-Ammmunition/B195e0423-Rheinmetall-120mm-system-house.pdf#page=6',
};
const legacy: WeaponProfile = { id: '遊戲化動能彈', velocity: 190, gravity: 1.2, provenance: 'game-balanced' };
export function obstacleFraction(start: Vector3, delta: Vector3, obstacles: readonly Obstacle[]): number {
  let nearest = 1;
  for (const box of obstacles) {
    let enter = 0, exit = 1;
    const axes = [[start.x,delta.x,box.x - box.halfX,box.x + box.halfX],[start.z,delta.z,box.z - box.halfZ,box.z + box.halfZ]];
    if (box.height !== undefined) axes.push([start.y,delta.y,0,box.height]);
    for (const axis of axes) {
      const [origin = 0,travel = 0,low = 0,high = 0] = axis;
      if (Math.abs(travel) < 1e-8) { if (origin < low || origin > high) { exit = -1; break; } }
      else { const near = (low - origin) / travel, far = (high - origin) / travel; enter = Math.max(enter,Math.min(near,far)); exit = Math.min(exit,Math.max(near,far)); }
    }
    if (enter <= exit && enter < nearest) nearest = enter;
  }
  return nearest;
}
export function weaponProfile(spec: TankSpec): WeaponProfile {
  return REALISM_SAMPLE && spec.id === 'leopard2a8' ? leopard : legacy;
}

export function launchPose(actor: Actor): { origin: Vector3; direction: Vector3; breech: Vector3 } {
  actor.visual.root.rotation.y = actor.yaw;
  actor.visual.turret.rotation.y = actor.aim - actor.yaw;
  actor.visual.barrel.rotation.x = actor.pitch;
  const origin = muzzlePosition(actor.visual, new Vector3());
  const direction = muzzleDirection(actor.visual, new Vector3());
  const breech = actor.visual.barrel.getWorldPosition(new Vector3());
  return { origin, direction, breech };
}

export function intercept(shooter: Actor, target: Actor): { aim: number; pitch: number; seconds: number } {
  const profile = weaponProfile(shooter.spec), pose = launchPose(shooter);
  const velocity = new Vector3(-Math.sin(target.yaw) * target.speed, 0, -Math.cos(target.yaw) * target.speed);
  const point = target.visual.root.position.clone().add(new Vector3(0, 2.35, 0));
  const predicted = point.clone();
  let seconds = point.distanceTo(pose.origin) / profile.velocity;
  if (REALISM_SAMPLE && shooter.visual.muzzleTip && shooter.visual.recoilTube) {
    const bodyRotation = new Quaternion();
    for (let part: Object3D | null = shooter.visual.body; part; part = part.parent) bodyRotation.premultiply(part.quaternion);
    const bodyInverse = bodyRotation.clone().invert(), yawAxis = new Vector3(0,1,0), pitchAxis = new Vector3(1,0,0);
    const origin = pose.origin.clone(), direction = new Vector3(), pivot = new Vector3(), gunRotation = new Quaternion();
    const yawRotation = new Quaternion(), pitchRotation = new Quaternion();
    let aim = shooter.aim, pitch = shooter.pitch;
    for (let iteration = 0; iteration < 6; iteration++) {
      predicted.copy(point).addScaledVector(velocity,seconds); predicted.y += .5 * profile.gravity * seconds * seconds;
      direction.copy(predicted).sub(origin).applyQuaternion(bodyInverse);
      const localYaw = Math.atan2(-direction.x,-direction.z);
      aim = shooter.yaw + localYaw; pitch = Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
      pivot.copy(shooter.visual.barrel.position).applyAxisAngle(yawAxis,localYaw).add(shooter.visual.turret.position).applyMatrix4(shooter.visual.body.matrixWorld);
      gunRotation.copy(bodyRotation).multiply(yawRotation.setFromAxisAngle(yawAxis,localYaw)).multiply(pitchRotation.setFromAxisAngle(pitchAxis,pitch));
      origin.copy(shooter.visual.muzzleTip.position).add(shooter.visual.recoilTube.position).applyQuaternion(gunRotation).add(pivot);
      seconds = predicted.distanceTo(origin) / profile.velocity;
    }
    return { aim,pitch,seconds };
  }
  for (let iteration = 0; iteration < 4; iteration++) {
    predicted.copy(point).addScaledVector(velocity, seconds);
    predicted.y += .5 * profile.gravity * seconds * seconds;
    seconds = predicted.distanceTo(pose.origin) / profile.velocity;
  }
  const direction = predicted.sub(pose.origin);
  return { aim: Math.atan2(-direction.x, -direction.z), pitch: Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), seconds };
}
