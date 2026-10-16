import { AdditiveBlending, BoxGeometry, Color, CylinderGeometry, ConeGeometry, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BufferGeometry, Scene } from 'three';
import type { Actor } from './actors';
import type { Effects } from './effects';
import { impactArmor, intersectTank } from './armor';
import type { ArmorFace, HitZone, Impact } from './armor';
import { wallFraction } from './math';
import type { Obstacle } from './render/world';
import { kickTank, muzzleDirection, muzzlePosition } from './render/tank';
import { armorNormal, groundContact, gunProfile, impactGrade, tracerLength, tracerLengthV19, wallKind, wallNormal } from './effect-math';
import type { ImpactKind } from './effect-math';
import { launchPose, weaponProfile, obstacleFraction } from './ballistics';
import { REALISM_SAMPLE } from './realism';
import type { ImpactGrade } from './game-events-v19';

interface Shell { source: Actor | null; readonly position: Vector3; readonly velocity: Vector3; readonly offset: Vector3; readonly breech: Vector3; age: number; trailAge: number; gravity: number; initial: boolean; flown: number; near: number; flyDone: boolean }
export interface Contact { readonly position: Vector3; readonly normal: Vector3; readonly kind: ImpactKind; readonly destroyed: boolean; readonly calibre: number; readonly grade?: ImpactGrade }
export interface CombatEvents {
  readonly flyby?: (position: Vector3, speed: number, calibre: number) => void;
  readonly shot: () => void;
  readonly cannon?: (position: Vector3, enemy: boolean, calibre: number) => void;
  readonly contact?: (contact: Contact) => void;
  readonly prop?: (id: number, position: Vector3, byPlayer: boolean) => void;
  readonly hit: (damage: number, killed: boolean, enemy: boolean, impact: Impact) => void;
}
function projectileGeometry(): BufferGeometry {
  if (!REALISM_SAMPLE) return new ConeGeometry(.085,.85,6).rotateX(Math.PI / 2);
  const pieces = [new CylinderGeometry(.014,.014,.56,8),new ConeGeometry(.014,.12,8).translate(0,.34,0)];
  const fins = [new BoxGeometry(.075,.12,.003).translate(0,-.2,0),new BoxGeometry(.003,.12,.075).translate(0,-.2,0)];
  const all = [...pieces,...fins], geometry = mergeGeometries(all);
  if (!geometry) throw new Error('Projectile geometry could not be combined');
  for (const part of all) part.dispose();
  return geometry.rotateX(Math.PI / 2);
}
export class Combat {
  private readonly shells: Shell[] = Array.from({ length: 32 }, () => ({ source: null, position: new Vector3(), velocity: new Vector3(), offset: new Vector3(), breech: new Vector3(), age: 0, trailAge: 0, gravity: 1.2, initial: false, flown: 0, near: Infinity, flyDone: false }));
  private readonly inFlight: Shell[] = [];
  private readonly bodies = new InstancedMesh(projectileGeometry(), new MeshBasicMaterial({ color: 0xc4b68e }), 32);
  private readonly tracers = new InstancedMesh(new SphereGeometry(1, 6, 4), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, blending: AdditiveBlending, depthWrite: false }), 64);
  private readonly step = new Vector3();
  private readonly pose = new Object3D();
  private readonly axis = new Vector3(0, 0, 1);
  private readonly direction = new Vector3();
  private readonly closest = new Vector3();
  private cursor = 0; private disposed = false;
  constructor(scene: Scene, private readonly effects: Effects, private readonly events: CombatEvents) {
    this.bodies.name = 'projectile-bodies'; this.tracers.name = 'projectile-tracers';
    for (const batch of [this.bodies, this.tracers]) { batch.frustumCulled = false; batch.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(batch); }
    for (let i = 0; i < 32; i++) { this.tracers.setColorAt(i, new Color(0xfff1c4)); this.tracers.setColorAt(i + 32, new Color(0xff8f30)); }
    this.sync();
  }
  fire(actor: Actor, obstacles: readonly Obstacle[]): boolean {
    if (this.disposed || !actor.alive || actor.cooldown > 0) return false;
    actor.reloadDuration = actor.spec.reload * (actor.rapidShots > 0 ? .68 : 1);
    actor.cooldown = actor.reloadDuration;
    actor.rapidShots = Math.max(0, actor.rapidShots - 1);
    const pose = launchPose(actor), profile = weaponProfile(actor.spec);
    const direction = REALISM_SAMPLE ? pose.direction : new Vector3(-Math.sin(actor.aim) * Math.cos(actor.pitch), Math.sin(actor.pitch), -Math.cos(actor.aim) * Math.cos(actor.pitch));
    actor.visual.root.rotation.y = actor.yaw; actor.visual.turret.rotation.y = actor.aim - actor.yaw; actor.visual.barrel.rotation.x = actor.pitch;
    const muzzle = muzzlePosition(actor.visual, new Vector3());
    const muzzleAxis = muzzleDirection(actor.visual, new Vector3());
    kickTank(actor.visual, actor.spec.gun, actor.spec.weight, actor.aim - actor.yaw);
    const origin = actor.visual.root.position;
    const position = REALISM_SAMPLE ? pose.origin.clone() : origin.clone().add(new Vector3(0, 2.5, 0)).addScaledVector(direction, 5.5);
    this.events.cannon?.(muzzle, actor.enemy, actor.spec.gun);
    const clearanceStart = REALISM_SAMPLE ? pose.breech : origin.clone().add(new Vector3(0, 2.5, 0));
    const clearanceStep = position.clone().sub(clearanceStart);
    const clearance = REALISM_SAMPLE ? obstacleFraction(clearanceStart,clearanceStep,obstacles) : wallFraction(clearanceStart.x, clearanceStart.z, clearanceStep.x, clearanceStep.z, obstacles);
    if (clearance < 1 && !REALISM_SAMPLE) {
      position.copy(clearanceStart).addScaledVector(clearanceStep, clearance);
      this.contact(position, wallNormal(position, obstacles, direction), direction, wallKind(position, obstacles), actor.spec.gun);
    } else {
      const plume = gunProfile(actor.spec.gun).length;
      const visualClear = wallFraction(origin.x, origin.z, muzzle.x - origin.x, muzzle.z - origin.z, obstacles);
      if (visualClear === 1) this.effects.muzzle(muzzle, muzzleAxis, actor.spec.gun, !actor.enemy,
        wallFraction(muzzle.x, muzzle.z, muzzleAxis.x * plume, muzzleAxis.z * plume, obstacles), obstacles);
      const slot = this.shells.find(shell => shell.source === null) ?? this.shells[this.cursor++ % this.shells.length];
      if (slot) { const previous = this.inFlight.indexOf(slot); if (previous >= 0) this.inFlight.splice(previous, 1);
        this.inFlight.push(slot); slot.source = actor; slot.position.copy(position); slot.velocity.copy(direction).multiplyScalar(profile.velocity);
        slot.offset.copy(muzzle).sub(position); slot.age = 0; slot.trailAge = 0; slot.gravity = profile.gravity; slot.breech.copy(pose.breech); slot.initial = REALISM_SAMPLE; slot.flown = 0; slot.near = Infinity; slot.flyDone = false; }
    }
    this.sync();
    if (!actor.enemy) this.events.shot();
    return true;
  }
  update(dt: number, actors: readonly Actor[], obstacles: readonly Obstacle[], damageScale: number, props?: { test(p: Vector3, step: Vector3): { fraction: number; id: number } | null }): void {
    if (dt <= 0 || !Number.isFinite(dt) || this.disposed) return;
    let changed = false;
    for (let index = this.inFlight.length - 1; index >= 0; index--) {
      const shell = this.inFlight[index]; if (!shell) continue;
      const source = shell.source; if (!source) continue; changed = true;
      shell.age += dt;
      const p = shell.position, step = this.step.copy(shell.velocity).multiplyScalar(dt);
      if (REALISM_SAMPLE) step.y -= .5 * shell.gravity * dt * dt;
      if (shell.initial) {
        step.x += p.x - shell.breech.x; step.y += p.y - shell.breech.y; step.z += p.z - shell.breech.z;
        p.copy(shell.breech); shell.initial = false;
      }
      let fraction = REALISM_SAMPLE ? obstacleFraction(p,step,obstacles) : wallFraction(p.x, p.z, step.x, step.z, obstacles);
      const floorFraction = p.y + step.y < .2 ? groundContact(p.y, step.y) : 1;
      let ground = floorFraction < fraction;
      if (ground) fraction = floorFraction;
      let target: Actor | undefined;
      let zone: HitZone = 'hull';
      for (const actor of actors) {
        if (!actor.alive || actor === source || actor.enemy === source.enemy) continue;
        const hit = intersectTank(actor, p, step);
        if (hit !== null && hit.fraction < fraction) { fraction = hit.fraction; target = actor; zone = hit.zone; ground = false; }
      }
      let propId = -1; let gradeFactor = 1; let gradeFace: ArmorFace | undefined;
      if (props && !target) {
        const strike = props.test(p, step);
        if (strike && strike.fraction < fraction) { fraction = strike.fraction; propId = strike.id; ground = false; }
      }
      p.addScaledVector(step, fraction);
      shell.flown += step.length() * fraction;
      shell.velocity.y -= shell.gravity * dt * fraction;
      if (source.enemy && !shell.flyDone && fraction === 1) this.flybyCheck(shell, source, actors);
      if (fraction < 1 || ground) {
        let kind: ImpactKind = ground ? 'road' : wallKind(p, obstacles);
        let normal = ground ? new Vector3(0, 1, 0) : wallNormal(p, obstacles, shell.velocity);
        if (target) {
          const { face, factor, bearing } = impactArmor(target, zone, shell.velocity);
          gradeFactor = factor; gradeFace = face;
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
        if (propId >= 0) { this.events.prop?.(propId, p.clone(), !source.enemy); kind = 'armor'; normal = new Vector3(0, 1, 0); }
        const grade = impactGrade({ target: !!target && propId < 0, cosIncidence: -shell.velocity.clone().normalize().dot(normal),
          factor: target ? gradeFactor : undefined, face: gradeFace, destroyed: !!target && !target.alive });
        this.contact(p, normal, shell.velocity, kind, source.spec.gun, target, grade);
        shell.source = null; this.inFlight.splice(index, 1);
      } else if (shell.age > 3) { shell.source = null; this.inFlight.splice(index, 1); }
      else {
        shell.trailAge += dt;
        if (!REALISM_SAMPLE && shell.trailAge >= .04) { shell.trailAge %= .04; this.effects.trail(p, !source.enemy); }
      }
    }
    if (changed) this.sync();
  }
  private contact(position: Vector3, normal: Vector3, incoming: Vector3, kind: ImpactKind, calibre: number, target?: Actor, grade?: ImpactGrade): void {
    this.effects.impact(position, normal, incoming, kind, calibre, target?.visual.root ?? null, grade);
    this.events.contact?.({ position: position.clone(), normal, kind, calibre, destroyed: target ? !target.alive : false, ...(grade ? { grade } : {}) });
  }
  /** One `flyby` per enemy shell: closest approach to the player < 20 m and now receding. Never touches hit resolution. */
  private flybyCheck(shell: Shell, source: Actor, actors: readonly Actor[]): void {
    const player = actors.find(actor => !actor.enemy && actor.alive); if (!player) return;
    const target = player.visual.root.position, p = shell.position;
    const distance = Math.hypot(p.x - target.x, p.y - target.y - 1.6, p.z - target.z);
    if (distance < shell.near) { shell.near = distance; this.closest.copy(p); return; }
    if (shell.near < 20) {
      shell.flyDone = true;
      this.events.flyby?.(this.closest.clone(), shell.velocity.length(), source.spec.gun);
    }
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
        const speed = shell.velocity.length();
        const length = REALISM_SAMPLE ? Math.min(2, tracerLength(speed, shell.age)) : tracerLengthV19(speed, shell.flown);
        this.pose.position.addScaledVector(this.direction, -length / 2);
        const width = (REALISM_SAMPLE ? .018 : .035) * source.spec.gun / 120;
        this.pose.scale.set(width, width, length / 2);
        if (!REALISM_SAMPLE) {
          // bright narrow core + wider warm halo (second instance block)
          this.pose.scale.set(width * .55, width * .55, length / 2);
          this.pose.updateMatrix(); this.tracers.setMatrixAt(i, this.pose.matrix);
          this.pose.scale.set(width * 1.9, width * 1.9, length / 2 * 1.08);
          this.pose.updateMatrix(); this.tracers.setMatrixAt(i + 32, this.pose.matrix);
          continue;
        }
      }
      this.pose.updateMatrix(); this.tracers.setMatrixAt(i, this.pose.matrix);
      if (!source) { this.tracers.setMatrixAt(i + 32, this.pose.matrix); }
    }
    for (const batch of [this.bodies, this.tracers]) { batch.visible = count > 0; batch.instanceMatrix.needsUpdate = true; }
  }
  lowFlash(enabled: boolean): void { this.tracers.material.opacity = enabled ? .1 : .55; }
  stats(): { active: number; capacity: number } { return { active: this.shells.filter(shell => shell.source).length, capacity: this.shells.length }; }
  projectileSnapshot(): { position: number[]; velocity: number[]; age: number }[] {
    return this.inFlight.map(shell => ({ position: shell.position.toArray(), velocity: shell.velocity.toArray(), age: shell.age }));
  }
  clear(): void { for (const shell of this.shells) shell.source = null; this.inFlight.length = 0; this.cursor = 0; this.sync(); }
  dispose(): void {
    if (this.disposed) return; this.clear(); this.disposed = true;
    for (const batch of [this.bodies, this.tracers]) { batch.removeFromParent(); batch.geometry.dispose(); batch.material.dispose(); batch.dispose(); }
  }
}
