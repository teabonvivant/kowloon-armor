import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import type { Scene } from 'three';
import type { Actor } from './actors';
import type { Effects } from './effects';
import { impactArmor, intersectTank } from './armor';
import type { HitZone, Impact } from './armor';
import { wallFraction } from './math';
import type { Obstacle } from './render/world';

interface Shell { readonly mesh: Mesh; readonly source: Actor; readonly velocity: Vector3; age: number }
export interface CombatEvents {
  readonly shot: () => void;
  readonly cannon?: (position: Vector3, enemy: boolean) => void;
  readonly hit: (damage: number, killed: boolean, enemy: boolean, impact: Impact) => void;
}
export class Combat {
  private readonly shells: Shell[] = [];
  private readonly geometry = new SphereGeometry(0.16, 6, 4);
  private readonly material = new MeshBasicMaterial({ color: 0xffdf8c });
  private readonly step = new Vector3();
  constructor(private readonly scene: Scene, private readonly effects: Effects, private readonly events: CombatEvents) {}
  fire(actor: Actor, obstacles: readonly Obstacle[]): boolean {
    if (!actor.alive || actor.cooldown > 0) return false;
    actor.reloadDuration = actor.spec.reload * (actor.rapidShots > 0 ? .68 : 1);
    actor.cooldown = actor.reloadDuration;
    actor.rapidShots = Math.max(0, actor.rapidShots - 1);
    actor.visual.recoil = .44;
    const direction = new Vector3(-Math.sin(actor.aim) * Math.cos(actor.pitch), Math.sin(actor.pitch),
      -Math.cos(actor.aim) * Math.cos(actor.pitch));
    const mesh = new Mesh(this.geometry, this.material);
    mesh.position.copy(actor.visual.root.position).add(new Vector3(0, 2.5, 0)).addScaledVector(direction, 5.5);
    const origin = actor.visual.root.position;
    this.events.cannon?.(origin, actor.enemy);
    const clearance = wallFraction(origin.x, origin.z, mesh.position.x - origin.x, mesh.position.z - origin.z, obstacles);
    if (clearance < 1) {
      this.effects.burst(new Vector3(origin.x, 2.5, origin.z).addScaledVector(direction, clearance * 5.5));
      if (!actor.enemy) this.events.shot();
      return true;
    }
    this.scene.add(mesh); this.effects.burst(mesh.position);
    this.shells.push({ mesh, source: actor, velocity: direction.multiplyScalar(190), age: 0 });
    if (!actor.enemy) this.events.shot();
    return true;
  }
  update(dt: number, actors: readonly Actor[], obstacles: readonly Obstacle[], damageScale: number): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i]; if (!shell) continue;
      shell.age += dt;
      const p = shell.mesh.position, step = this.step.copy(shell.velocity).multiplyScalar(dt);
      let fraction = wallFraction(p.x, p.z, step.x, step.z, obstacles);
      let target: Actor | undefined;
      let zone: HitZone = 'hull';
      for (const actor of actors) {
        if (!actor.alive || actor === shell.source || actor.enemy === shell.source.enemy) continue;
        const hit = intersectTank(actor, p, step);
        if (hit !== null && hit.fraction < fraction) { fraction = hit.fraction; target = actor; zone = hit.zone; }
      }
      p.addScaledVector(step, fraction);
      shell.velocity.y -= 1.2 * dt;
      if (fraction < 1 || p.y < 0.2 || shell.age > 3) {
        this.effects.burst(p, !!target);
        if (target) {
          const { face, factor, bearing } = impactArmor(target, zone, shell.velocity);
          const damage = Math.round(shell.source.spec.damage * factor * (1.35 - target.spec.armor / 200) *
            (shell.source.enemy ? damageScale : 1.9));
          target.hp = Math.max(0, target.hp - damage);
          if (zone === 'leftTrack') target.leftTrack = 6;
          if (zone === 'rightTrack') target.rightTrack = 6;
          if (target.hp === 0) { target.alive = false; target.speed = 0;
            target.visual.root.rotation.z = 0.055; target.visual.root.position.y = -0.2; }
          this.events.hit(damage, !target.alive, target.enemy, { zone, face, bearing, position: p.clone() });
        }
        this.scene.remove(shell.mesh); this.shells.splice(i, 1);
      }
    }
  }
  clear(): void { for (const shell of this.shells) this.scene.remove(shell.mesh); this.shells.length = 0; }
}
