import { AdditiveBlending, ConeGeometry, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three';
import type { Scene } from 'three';
import type { Actor } from './actors';
import type { Effects } from './effects';
import { impactArmor, intersectTank } from './armor';
import type { HitZone, Impact } from './armor';
import { wallFraction } from './math';
import type { Obstacle } from './render/world';
import { kickTank, muzzleDirection, muzzlePosition } from './render/tank';
import { armorNormal, groundContact, gunProfile, tracerLength, wallKind, wallNormal } from './effect-math';
import type { ImpactKind } from './effect-math';

interface Shell { source: Actor | null; readonly position: Vector3; readonly velocity: Vector3; readonly offset: Vector3; age: number; trailAge: number }
export interface Contact { readonly position: Vector3; readonly normal: Vector3; readonly kind: ImpactKind; readonly destroyed: boolean; readonly calibre: number }
export interface CombatEvents {
  readonly shot: () => void;
  readonly cannon?: (position: Vector3, enemy: boolean, calibre: number) => void;
  readonly contact?: (contact: Contact) => void;
  readonly hit: (damage: number, killed: boolean, enemy: boolean, impact: Impact) => void;
}
export class Combat {
  private readonly shells: Shell[] = Array.from({ length: 32 }, () => ({ source: null, position: new Vector3(), velocity: new Vector3(), offset: new Vector3(), age: 0, trailAge: 0 }));
  private readonly inFlight: Shell[] = [];
  private readonly bodies = new InstancedMesh(new ConeGeometry(.085, .85, 6).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0xc4b68e }), 32);
  private readonly tracers = new InstancedMesh(new SphereGeometry(1, 6, 4), new MeshBasicMaterial({ color: 0xffce75, transparent: true, opacity: .55, blending: AdditiveBlending, depthWrite: false }), 32);
  private readonly step = new Vector3();
  private readonly pose = new Object3D();
  private readonly axis = new Vector3(0, 0, 1);
  private readonly direction = new Vector3();
  private cursor = 0; private disposed = false;
  constructor(scene: Scene, private readonly effects: Effects, private readonly events: CombatEvents) {
    this.bodies.name = 'projectile-bodies'; this.tracers.name = 'projectile-tracers';
    for (const batch of [this.bodies, this.tracers]) { batch.frustumCulled = false; batch.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(batch); }
    this.sync();
  }
  fire(actor: Actor, obstacles: readonly Obstacle[]): boolean {
    if (this.disposed || !actor.alive || actor.cooldown > 0) return false;
    actor.reloadDuration = actor.spec.reload * (actor.rapidShots > 0 ? .68 : 1);
    actor.cooldown = actor.reloadDuration;
    actor.rapidShots = Math.max(0, actor.rapidShots - 1);
    const direction = new Vector3(-Math.sin(actor.aim) * Math.cos(actor.pitch), Math.sin(actor.pitch), -Math.cos(actor.aim) * Math.cos(actor.pitch));
    actor.visual.root.rotation.y = actor.yaw; actor.visual.turret.rotation.y = actor.aim - actor.yaw; actor.visual.barrel.rotation.x = actor.pitch;
    const muzzle = muzzlePosition(actor.visual, new Vector3());
    const muzzleAxis = muzzleDirection(actor.visual, new Vector3());
    kickTank(actor.visual, actor.spec.gun, actor.spec.weight, actor.aim - actor.yaw);
    const origin = actor.visual.root.position;
    const position = origin.clone().add(new Vector3(0, 2.5, 0)).addScaledVector(direction, 5.5);
    this.events.cannon?.(muzzle, actor.enemy, actor.spec.gun);
    const clearance = wallFraction(origin.x, origin.z, position.x - origin.x, position.z - origin.z, obstacles);
    if (clearance < 1) {
      position.copy(origin).add(new Vector3(0, 2.5, 0)).addScaledVector(direction, clearance * 5.5);
      this.contact(position, wallNormal(position, obstacles, direction), direction, wallKind(position, obstacles), actor.spec.gun);
    } else {
      const plume = gunProfile(actor.spec.gun).length;
      const visualClear = wallFraction(origin.x, origin.z, muzzle.x - origin.x, muzzle.z - origin.z, obstacles);
      if (visualClear === 1) this.effects.muzzle(muzzle, muzzleAxis, actor.spec.gun, !actor.enemy,
        wallFraction(muzzle.x, muzzle.z, muzzleAxis.x * plume, muzzleAxis.z * plume, obstacles));
      const slot = this.shells.find(shell => shell.source === null) ?? this.shells[this.cursor++ % this.shells.length];
      if (slot) { const previous = this.inFlight.indexOf(slot); if (previous >= 0) this.inFlight.splice(previous, 1);
        this.inFlight.push(slot); slot.source = actor; slot.position.copy(position); slot.velocity.copy(direction).multiplyScalar(190);
        slot.offset.copy(muzzle).sub(position); slot.age = 0; slot.trailAge = 0; }
    }
    this.sync();
    if (!actor.enemy) this.events.shot();
    return true;
  }
  update(dt: number, actors: readonly Actor[], obstacles: readonly Obstacle[], damageScale: number): void {
    if (dt <= 0 || !Number.isFinite(dt) || this.disposed) return;
    let changed = false;
    for (let index = this.inFlight.length - 1; index >= 0; index--) {
      const shell = this.inFlight[index]; if (!shell) continue;
      const source = shell.source; if (!source) continue; changed = true;
      shell.age += dt;
      const p = shell.position, step = this.step.copy(shell.velocity).multiplyScalar(dt);
      let fraction = wallFraction(p.x, p.z, step.x, step.z, obstacles);
      let target: Actor | undefined;
      let zone: HitZone = 'hull';
      for (const actor of actors) {
        if (!actor.alive || actor === source || actor.enemy === source.enemy) continue;
        const hit = intersectTank(actor, p, step);
        if (hit !== null && hit.fraction < fraction) { fraction = hit.fraction; target = actor; zone = hit.zone; }
      }
      const ground = fraction === 1 && p.y + step.y < .2;
      if (ground) fraction = groundContact(p.y, step.y);
      p.addScaledVector(step, fraction);
      shell.velocity.y -= 1.2 * dt;
      if (fraction < 1 || ground) {
        let kind: ImpactKind = ground ? 'road' : wallKind(p, obstacles);
        let normal = ground ? new Vector3(0, 1, 0) : wallNormal(p, obstacles, shell.velocity);
        if (target) {
          const { face, factor, bearing } = impactArmor(target, zone, shell.velocity);
          const damage = Math.min(target.hp, Math.round(source.spec.damage * factor * (1.35 - target.spec.armor / 200) * (source.enemy ? damageScale : 1.9)));
          target.hp = Math.max(0, target.hp - damage);
          if (zone === 'leftTrack') target.leftTrack = 6;
          if (zone === 'rightTrack') target.rightTrack = 6;
          normal = armorNormal(target, zone, p); kind = zone.endsWith('Track') ? 'track' : 'armor';
          if (target.hp === 0) { target.alive = false; target.speed = 0; target.visual.wreckAge = 0;
            target.visual.root.rotation.z = .055; target.visual.root.position.y = -.2;
            this.effects.destroy(target.visual.root.position.clone().add(new Vector3(0, 2.5, 0)), source.spec.gun); }
          this.events.hit(damage, !target.alive, target.enemy, { zone, face, bearing, position: p.clone() });
        }
        this.contact(p, normal, shell.velocity, kind, source.spec.gun, target);
        shell.source = null; this.inFlight.splice(index, 1);
      } else if (shell.age > 3) { shell.source = null; this.inFlight.splice(index, 1); }
      else {
        shell.trailAge += dt;
        if (shell.trailAge >= .04) { shell.trailAge %= .04; this.effects.trail(p, !source.enemy); }
      }
    }
    if (changed) this.sync();
  }
  private contact(position: Vector3, normal: Vector3, incoming: Vector3, kind: ImpactKind, calibre: number, target?: Actor): void {
    this.effects.impact(position, normal, incoming, kind, calibre, target?.visual.root ?? null);
    this.events.contact?.({ position: position.clone(), normal, kind, calibre, destroyed: target ? !target.alive : false });
  }
  private sync(): void {
    let count = 0;
    for (const [i, shell] of this.shells.entries()) {
      const source = shell.source;
      this.pose.scale.setScalar(0);
      if (source) {
        count++; this.direction.copy(shell.velocity).normalize();
        this.pose.position.copy(shell.position).addScaledVector(shell.offset, Math.max(0, 1 - shell.age / .08));
        this.pose.quaternion.setFromUnitVectors(this.axis, this.direction); this.pose.scale.setScalar(source.spec.gun / 120);
      }
      this.pose.updateMatrix(); this.bodies.setMatrixAt(i, this.pose.matrix);
      if (source) {
        const length = tracerLength(shell.velocity.length(), shell.age);
        this.pose.position.addScaledVector(this.direction, -length / 2);
        this.pose.scale.set(.035 * source.spec.gun / 120, .035 * source.spec.gun / 120, length / 2);
      }
      this.pose.updateMatrix(); this.tracers.setMatrixAt(i, this.pose.matrix);
    }
    for (const batch of [this.bodies, this.tracers]) { batch.visible = count > 0; batch.instanceMatrix.needsUpdate = true; }
  }
  lowFlash(enabled: boolean): void { this.tracers.material.opacity = enabled ? .15 : .55; }
  stats(): { active: number; capacity: number } { return { active: this.shells.filter(shell => shell.source).length, capacity: this.shells.length }; }
  clear(): void { for (const shell of this.shells) shell.source = null; this.inFlight.length = 0; this.cursor = 0; this.sync(); }
  dispose(): void {
    if (this.disposed) return; this.clear(); this.disposed = true;
    for (const batch of [this.bodies, this.tracers]) { batch.removeFromParent(); batch.geometry.dispose(); batch.material.dispose(); batch.dispose(); }
  }
}
