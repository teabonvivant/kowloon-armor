import { FogExp2, Matrix4, Points, Vector3 } from 'three';
import type { Object3D, PerspectiveCamera, Scene } from 'three';
import { DEFAULT_EFFECTS, effectBudget, effectPathClear, gunProfile, impactDirection } from './effect-math';
import type { EffectOptions, ImpactKind } from './effect-math';
import { EffectPool } from './render/effect-pools';
import type { Particle } from './render/effect-pools';
import type { Obstacle } from './render/world';
import { REALISM_SAMPLE } from './realism';
import type { ExplosionKind } from './game-events-v19';

export class Effects {
  private options: EffectOptions = { ...DEFAULT_EFFECTS };
  private readonly smoke: EffectPool;
  private readonly dustPool: EffectPool;
  private readonly flash: EffectPool;
  private readonly sparks: EffectPool;
  private readonly debris: EffectPool;
  private readonly marks: EffectPool;
  private readonly glow: EffectPool;
  private readonly pools: EffectPool[];
  private readonly observer = new Vector3();
  private readonly point = new Vector3();
  private seed = 71439;
  private disposed = false;
  constructor(private readonly scene: Scene) {
    this.smoke = new EffectPool(scene, 128, 'smoke', 'damage-smoke-pool');
    this.dustPool = new EffectPool(scene, 96, 'dust', 'track-dust');
    this.flash = new EffectPool(scene, 32, 'flash', 'muzzle-flame-pool');
    this.sparks = new EffectPool(scene, 128, 'spark', 'impact-sparks');
    this.debris = new EffectPool(scene, 64, 'debris', 'impact-debris');
    this.marks = new EffectPool(scene, 48, 'mark', 'impact-marks');
    this.glow = new EffectPool(scene, 12, 'glow', 'ground-reflection');
    this.pools = [this.smoke, this.dustPool, this.flash, this.sparks, this.debris, this.marks, this.glow];
    this.configure(this.options);
  }
  configure(options: EffectOptions): void {
    this.options = { ...options };
    const b = effectBudget(options.quality, options.mobile);
    this.smoke.limit = b.smoke; this.dustPool.limit = b.dust; this.flash.limit = b.flash;
    this.sparks.limit = b.sparks; this.debris.limit = b.debris; this.marks.limit = b.marks;
    for (const pool of this.pools) {
      pool.brightness = options.lowFlash ? .18 : 1;
      for (let i = pool.limit; i < pool.capacity; i++) { const p = pool.slots[i]; if (p) { p.life = 0; p.anchor = null; } }
      pool.sync();
    }
  }
  observe(position: Vector3): void { this.observer.copy(position); }
  private random(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  private density(at: Vector3): number {
    const distance = this.observer.distanceTo(at);
    if (distance > 260) return 0;
    return (this.options.mobile || this.options.quality === 'low' ? .45 : this.options.quality === 'high' ? 1 : .7) * (distance > 140 ? .3 : distance > 70 ? .6 : 1);
  }
  muzzle(at: Vector3, direction: Vector3, calibre: number, own = false, clearance = 1, obstacles: readonly Obstacle[] = []): void {
    const density = this.density(at); if (!density) return;
    if (REALISM_SAMPLE) { this.muzzleSample(at, direction, calibre, own, clearance, density, obstacles); return; }
    const profile = gunProfile(calibre), length = profile.length * Math.min(1, clearance);
    if (length <= .05) return;
    for (let layer = 0; layer < 2; layer++) {
      const p = this.flash.take(this.point.copy(at).addScaledVector(direction, length * .35), profile.duration);
      if (!p) continue;
      p.normal.copy(direction); p.scale.set(layer ? .42 : .19, layer ? .32 : .16, length * (layer ? .55 : .35));
      p.color.setHex(layer ? 0xff922e : 0xfff0bb); p.opacity = layer ? .58 : .92; p.own = own;
    }
    const side = new Vector3(direction.z, 0, -direction.x).normalize();
    for (const sign of [-1, 1]) {
      const p = this.flash.take(this.point.copy(at).addScaledVector(side, sign * .35), .075);
      if (p) { p.normal.copy(side).multiplyScalar(sign); p.scale.set(.17, .15, .55); p.opacity = .32; p.color.setHex(0xffb354); p.own = own; }
    }
    for (let i = 0; i < Math.ceil(6 * density); i++) {
      const p = this.smoke.take(this.point.copy(at).addScaledVector(direction, .3 + i * .25), .65 + this.random() * .6);
      if (!p) continue;
      p.delay = .035 + i * .018; p.velocity.copy(direction).multiplyScalar(2 + this.random() * 3);
      p.velocity.y += .8; p.drag = 1.6; p.size = .8; p.growth = 2.4; p.opacity = .3; p.color.setHex(0x9d9a8e); p.own = own;
    }
    if (at.y < 5) {
      const p = this.glow.take(this.point.set(at.x, .045, at.z), .14);
      if (p) { p.normal.set(0, 1, 0); p.scale.set(4, 5, 1); p.color.setHex(0xffab52); p.opacity = .23; p.own = own; }
      const rays = 2;
      for (let ray = 0; ray < rays; ray++) {
        const angle = ray * Math.PI * 2 / rays;
        const horizontal = side.x * Math.cos(angle) + direction.x * Math.sin(angle), along = side.z * Math.cos(angle) + direction.z * Math.sin(angle);
        const dust = this.dustPool.take(this.point.set(at.x + horizontal * .6,.25,at.z + along * .6), .9);
        if (dust) { dust.delay = .04; dust.velocity.set(horizontal * 2.8,.3,along * 2.8);
          dust.drag = 2; dust.size = 1.2; dust.growth = 2; dust.opacity = .25; dust.color.setHex(0xa39c87); dust.own = own; }
      }
    }
  }
  private muzzleSample(at: Vector3, direction: Vector3, calibre: number, own: boolean, clearance: number, density: number, obstacles: readonly Obstacle[]): void {
    const profile = gunProfile(calibre), confinement = Math.max(0, Math.min(1, clearance));
    const freeLength = profile.length * confinement, length = freeLength * .72, bore = profile.length / 2.8;
    if (!(length > .05) || direction.lengthSq() < 1e-8) return;
    const axis = direction.clone().normalize(), side = new Vector3(axis.z, 0, -axis.x);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0); else side.normalize();
    const up = new Vector3().crossVectors(axis, side).normalize();
    for (let layer = 0; layer < 2; layer++) {
      const pulse = this.flash.take(this.point.copy(at).addScaledVector(axis, length * .32), (layer ? .055 : .032) * Math.sqrt(bore));
      if (!pulse) continue;
      pulse.normal.copy(axis); pulse.delay = layer ? .007 : 0;
      pulse.scale.set((layer ? .28 : .115) * Math.sqrt(confinement), (layer ? .22 : .095) * Math.sqrt(confinement), length * (layer ? .46 : .31));
      pulse.color.setHex(layer ? 0xffbe73 : 0xfff2ce); pulse.opacity = layer ? .42 : .92; pulse.own = own;
      const expansion = .75 + pulse.life * 4;
      const front = this.point.copy(pulse.position).addScaledVector(axis, pulse.scale.z * expansion);
      if (!effectPathClear(at, front, Math.max(pulse.scale.x, pulse.scale.y) * expansion, obstacles)) pulse.life = 0;
    }
    const count = Math.ceil(6 * density), scale = bore * confinement;
    for (let index = 0; index < count; index++) {
      const progress = (index + .5) / count;
      this.point.copy(at).addScaledVector(axis, (.12 + progress * .62) * scale)
        .addScaledVector(side, (this.random() - .5) * .18 * progress * scale)
        .addScaledVector(up, (this.random() - .5) * .12 * progress * scale);
      const gas = this.smoke.take(this.point, .82 + this.random() * .14 - progress * .14);
      if (!gas) continue;
      gas.delay = .026 + progress * .065; gas.drag = 2.5;
      gas.velocity.copy(axis).multiplyScalar((3.1 - progress * .7) * scale)
        .addScaledVector(side, (this.random() - .5) * .7 * scale).addScaledVector(up, (.45 + progress * .25) * scale);
      gas.velocity.x += .45 * scale; gas.velocity.z += .18 * scale;
      gas.size = (.28 + progress * .38) * scale; gas.growth = (.9 + progress * .45) * scale;
      gas.opacity = .2 - progress * .06; gas.color.setHex(index % 2 ? 0xa3a197 : 0xb2afa2); gas.own = own;
      const radius = (gas.size + gas.life * gas.growth) / 2;
      const travel = -Math.expm1(-gas.drag * gas.life) / gas.drag;
      const remaining = freeLength - radius - this.point.copy(gas.position).sub(at).dot(axis);
      const forwardSpeed = gas.velocity.dot(axis);
      if (forwardSpeed * travel > remaining) gas.velocity.addScaledVector(axis, Math.max(0, remaining / travel) - forwardSpeed);
      if (!this.particlePathClear(gas, at, obstacles)) gas.life = 0;
    }
    const groundForce = Math.max(0, 1 - Math.max(0, at.y) / 5) * bore;
    if (groundForce <= 0) return;
    const ground = new Vector3(at.x, .12, at.z), forward = new Vector3(axis.x, 0, axis.z).normalize();
    const glowRadius = .75 + groundForce * 1.1;
    if (effectPathClear(ground, ground, glowRadius * 1.2, obstacles)) {
      const glow = this.glow.take(this.point.set(at.x, .045, at.z), .048 + .01 * bore);
      if (glow) { glow.normal.set(0, 1, 0); glow.scale.set(glowRadius * 2, glowRadius * 2.4, 1);
        glow.color.setHex(0xffc88b); glow.opacity = .08 * groundForce; glow.own = own; }
    }
    const rays = Math.ceil(5 * density);
    for (let ray = 0; ray < rays; ray++) {
      const angle = (ray + .2 + this.random() * .3) * Math.PI * 2 / rays;
      const radial = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(forward, Math.sin(angle) + .35).normalize();
      const reach = .3 + this.random() * .45;
      const dust = this.dustPool.take(this.point.copy(ground).addScaledVector(radial, reach), .6 + this.random() * .24);
      if (!dust) continue;
      dust.delay = Math.max(0, at.y) / 343 + reach / (12 + groundForce * 12);
      dust.velocity.copy(radial).multiplyScalar((2.6 + this.random() * 1.3) * Math.sqrt(groundForce)); dust.velocity.y = .16;
      dust.drag = 2.9; dust.size = .55 + this.random() * .25; dust.growth = 1.05;
      dust.opacity = .16 * groundForce * (.8 + this.random() * .4); dust.color.setHex(0xa39e90); dust.own = own;
      if (!this.particlePathClear(dust, ground, obstacles)) dust.life = 0;
    }
  }
  private particlePathClear(particle: Particle, origin: Vector3, obstacles: readonly Obstacle[]): boolean {
    const radius = (particle.size + particle.life * particle.growth) / 2;
    if (!effectPathClear(origin, particle.position, radius, obstacles)) return false;
    const travel = particle.drag > 0 ? -Math.expm1(-particle.drag * particle.life) / particle.drag : particle.life;
    return effectPathClear(particle.position, this.point.copy(particle.position).addScaledVector(particle.velocity, travel), radius, obstacles);
  }
  impact(at: Vector3, normal: Vector3, incoming: Vector3, kind: ImpactKind, calibre: number, anchor: Object3D | null = null): void {
    const density = this.density(at); if (!density) return;
    const metal = kind === 'armor' || kind === 'metal' || kind === 'track', track = kind === 'track';
    const reflected = impactDirection(incoming, normal), scale = gunProfile(calibre).length / 2.8;
    const count = Math.ceil((metal ? track ? 13 : 22 : REALISM_SAMPLE ? 0 : 5) * density);
    for (let i = 0; i < count; i++) {
      const p = this.sparks.take(this.point.copy(at).addScaledVector(normal, .07), .16 + this.random() * (track ? .24 : .4));
      if (!p) continue;
      p.velocity.copy(reflected).multiplyScalar(7 + this.random() * 14).addScaledVector(normal, 2 + this.random() * 4);
      p.velocity.x += (this.random() - .5) * 7; p.velocity.z += (this.random() - .5) * 7; p.velocity.y += this.random() * 5;
      if (p.velocity.dot(normal) < 0) p.velocity.reflect(normal);
      p.normal.copy(p.velocity).normalize(); p.scale.set(.023, .023, .22 + this.random() * .25); p.gravity = 10; p.drag = 2;
      p.color.setHex(track ? 0xdca15d : 0xffd087); p.opacity = metal ? .85 : .4;
    }
    for (let i = 0; i < Math.ceil((metal ? 3 : 9) * density); i++) {
      const p = this.smoke.take(this.point.copy(at).addScaledVector(normal, .18), (metal ? .6 : 1.4) + this.random() * .7);
      if (!p) continue;
      p.velocity.copy(normal).multiplyScalar(1.2 + this.random() * 2); p.velocity.y += metal ? .6 : .9;
      p.velocity.x += (this.random() - .5) * 2; p.velocity.z += (this.random() - .5) * 2;
      p.drag = 1.3; p.size = metal ? .55 : 1.3; p.growth = metal ? 1.1 : 2; p.opacity = metal ? .3 : .5;
      p.color.setHex(kind === 'building' ? 0xa9a38f : kind === 'road' ? 0x6a6861 : 0x707571);
    }
    if (this.observer.distanceTo(at) < 140) for (let i = 0; i < Math.ceil((track ? 9 : metal ? 4 : 12) * density); i++) {
      const p = this.debris.take(this.point.copy(at).addScaledVector(normal, .12), .8 + this.random() * 1.2);
      if (!p) continue;
      p.velocity.copy(normal).multiplyScalar(2 + this.random() * 5); p.velocity.y += 2 + this.random() * 4;
      p.velocity.x += (this.random() - .5) * 5; p.velocity.z += (this.random() - .5) * 5;
      p.gravity = 12; p.drag = .5; p.size = (.06 + this.random() * .12) * scale;
      p.scale.set(track ? 1.8 : 1, .6, 1.1); p.color.setHex(metal ? 0x42463f : kind === 'road' ? 0x4d4b43 : 0x9d9582);
    }
    const mark = this.marks.take(this.point.copy(at).addScaledVector(normal, .035), metal ? 10 : 18);
    if (mark) {
      if (kind === 'road') mark.position.y = .035;
      mark.normal.copy(normal); mark.size = (metal ? .55 : 1.15) * scale; mark.color.setHex(0x292822); mark.opacity = .7;
      if (anchor) {
        anchor.updateWorldMatrix(true, false); mark.anchor = anchor; mark.local.copy(mark.position); anchor.worldToLocal(mark.local);
        mark.localNormal.copy(normal).transformDirection(new Matrix4().copy(anchor.matrixWorld).invert());
      }
    }
  }
  destroy(at: Vector3, calibre: number): void {
    if (!this.density(at)) return;
    for (let i = 0; i < 5; i++) {
      const p = this.flash.take(this.point.copy(at).add(new Vector3((this.random() - .5) * 2, .8 + this.random(), (this.random() - .5) * 2)), .14);
      if (p) { p.delay = i * .035; p.scale.set(.8, .8, 1.2); p.color.setHex(0xff982e); p.opacity = .7; }
    }
    this.impact(at, new Vector3(0, 1, 0), new Vector3(0, -1, 0), 'track', calibre);
    for (let i = 0; i < Math.ceil(12 * this.density(at)); i++) {
      const p = this.smoke.take(this.point.copy(at).add(new Vector3((this.random() - .5) * 2, 1, (this.random() - .5) * 2)), 2.5 + this.random());
      if (p) { p.delay = .1 + i * .025; p.velocity.set((this.random() - .5) * 2, 1.2 + this.random(), (this.random() - .5) * 2);
        p.size = 1.8; p.growth = 2; p.opacity = .55; p.color.setHex(0x383c39); p.drag = .25; }
    }
  }
  /** v1.9 dedicated explosion visuals (fire ball, smoke column, debris, shock ring, scorch). */
  explosion(kind: ExplosionKind, at: Vector3, power: number): void { void kind; void power; this.destroy(at, 155); }
  damage(at: Vector3, health: number | boolean, wreckAge = 0): void {
    const hp = typeof health === 'boolean' ? health ? 0 : .2 : health;
    if (hp >= .65 || (hp <= 0 && wreckAge >= 28)) return;
    const density = this.density(at); if (!density) return;
    const count = Math.max(1, Math.ceil((hp > .35 ? 1 : hp > 0 ? 3 : wreckAge < 12 ? 4 : 2) * density));
    for (let i = 0; i < count; i++) {
      const p = this.smoke.take(this.point.copy(at).add(new Vector3((this.random() - .5) * 1.3, .3, (this.random() - .5) * 1.3)), 2 + this.random() * 1.5);
      if (!p) continue;
      p.delay = this.random() * .12; p.velocity.set(.5 + this.random() * .4, hp <= 0 ? 1.9 : 1.1, .2);
      p.size = hp > .35 ? .7 : 1.4; p.growth = hp <= 0 ? 1.5 : .9;
      p.opacity = hp > .35 ? .18 : hp > 0 ? .4 : .52 * Math.min(1, (28 - wreckAge) / 10);
      p.color.setHex(hp > .35 ? 0x7e8580 : 0x414440);
    }
    if (hp <= 0 && wreckAge < 12) {
      const p = this.flash.take(this.point.copy(at).add(new Vector3((this.random() - .5) * 1.5, .2, (this.random() - .5) * 1.5)), .14);
      if (p) { p.normal.set(0, 1, 0); p.scale.set(.28, .28, .8 + this.random() * .5); p.opacity = .5 * (1 - wreckAge / 12); p.color.setHex(0xe67e26); }
    }
  }
  dust(at: Vector3, yaw: number, speed: number, left = true, right = true): void {
    if (Math.abs(speed) < 3 || !this.density(at)) return;
    for (const side of [-1, 1]) {
      if (side < 0 ? !left : !right) continue;
      const direction = speed < 0 ? -1 : 1;
      const p = this.dustPool.take(this.point.set(at.x + Math.sin(yaw) * 2.8 * direction + Math.cos(yaw) * side * 1.8, .25,
        at.z + Math.cos(yaw) * 2.8 * direction - Math.sin(yaw) * side * 1.8), .65 + this.random() * .5);
      if (!p) continue;
      p.velocity.set(Math.sin(yaw) * direction * 1.4 + side * .3, .4, Math.cos(yaw) * direction * 1.4);
      p.drag = .8; p.size = .5 + Math.min(20, Math.abs(speed)) * .045; p.growth = 1.2;
      p.opacity = .12 + Math.min(20, Math.abs(speed)) * .008; p.color.setHex(0xa59d87);
    }
  }
  trail(at: Vector3, own: boolean): void {
    if (this.options.quality === 'low' || this.options.mobile || this.observer.distanceTo(at) > 120) return;
    const p = this.smoke.take(at, .28);
    if (p) { p.size = .16; p.growth = .5; p.opacity = .12; p.color.setHex(0xbbb6a3); p.own = own; p.velocity.set(.3, .1, .1); }
  }
  burst(at: Vector3, big = false): void { if (big) this.destroy(at, 120); else this.impact(at, new Vector3(0, 1, 0), new Vector3(0, -1, 0), 'building', 120); }
  update(dt: number): void { if (dt > 0) for (const pool of this.pools) pool.update(dt); }
  prepare(camera: PerspectiveCamera, height: number, firstPerson: boolean): void {
    const fog = this.scene.fog;
    for (const pool of this.pools) {
      const visibility = firstPerson ? .13 : 1;
      if (pool.ownVisibility !== visibility) { pool.ownVisibility = visibility; pool.sync(); }
      if (pool.object instanceof Points) {
        const uniforms = pool.object.material.uniforms;
        if (uniforms['projectionScale']) uniforms['projectionScale'].value = height / (2 * Math.tan(camera.fov * Math.PI / 360));
        if (fog instanceof FogExp2) { if (uniforms['fogColor']) uniforms['fogColor'].value.copy(fog.color); if (uniforms['fogDensity']) uniforms['fogDensity'].value = fog.density; }
      }
    }
  }
  stats(): { active: number; smoke: number; dust: number; flash: number; sparks: number; debris: number; marks: number; capacity: ReturnType<typeof effectBudget>; resources: number; anchors: number; markX: number; minDebrisY: number; radiance: number } {
    return { active: this.pools.reduce((sum, p) => sum + p.active, 0), smoke: this.smoke.active, dust: this.dustPool.active,
      flash: this.flash.active, sparks: this.sparks.active, debris: this.debris.active, marks: this.marks.active,
      capacity: effectBudget(this.options.quality, this.options.mobile), resources: this.disposed ? 0 : this.pools.length * 2,
      anchors: this.marks.slots.filter(p => p.anchor).length, markX: this.marks.slots.find(p => p.life > 0)?.position.x ?? 0,
      minDebrisY: this.debris.slots.reduce((min, p) => p.life > 0 ? Math.min(min, p.position.y) : min, 1000),
      radiance: this.flash.slots.reduce((sum, p) => sum + (p.life > 0 ? p.opacity * this.flash.brightness : 0), 0) };
  }
  clear(): void { for (const pool of this.pools) pool.clear(); this.seed = 71439; }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const pool of this.pools) pool.dispose(); }
}
