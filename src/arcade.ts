import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';
import { blocked } from './math';
import type { Obstacle } from './render/world';

export type PropKind = 'barrel' | 'car';
export type PickupKind = 'repair' | 'rapid';
export interface Prop { readonly id: number; readonly kind: PropKind; readonly x: number; readonly z: number; readonly radius: number; readonly height: number; alive: boolean; readonly root: Object3D }
export interface Pickup { readonly kind: PickupKind; readonly x: number; readonly z: number; ttl: number; readonly root: Object3D }

export const COMBO_WINDOW = 5;
export const STRIKE_COOLDOWN = 32;
export const STRIKE_SHELLS = 7;
export const COMBO_CAP = 6;
export function comboMultiplier(combo: number): number { return Math.min(COMBO_CAP, Math.max(1, combo)); }

function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const BARREL = new CylinderGeometry(.55, .55, 1.4, 12);
const BAND = new CylinderGeometry(.57, .57, .28, 12);
const CAR_BODY = new BoxGeometry(4.2, 1.05, 1.9);
const CAR_CABIN = new BoxGeometry(2.1, .8, 1.7);
const PICKUP_BOX = new BoxGeometry(1.1, 1.1, 1.1);
const PICKUP_RING = new TorusGeometry(1.25, .08, 6, 24);
const MATERIALS = {
  red: new MeshStandardMaterial({ color: 0xb02a1e, roughness: .55, metalness: .3 }),
  yellow: new MeshStandardMaterial({ color: 0xf2c230, roughness: .5, emissive: 0x3a2a00 }),
  char: new MeshStandardMaterial({ color: 0x1b1a18, roughness: 1 }),
  glass: new MeshStandardMaterial({ color: 0x2a3844, roughness: .2, metalness: .5 }),
  repair: new MeshStandardMaterial({ color: 0x4fe08f, emissive: 0x178a4c, emissiveIntensity: 1.4, roughness: .4 }),
  rapid: new MeshStandardMaterial({ color: 0xffa23a, emissive: 0xb35a00, emissiveIntensity: 1.4, roughness: .4 }),
};
const CAR_COLOURS = [0xd9d6cc, 0x2f5fa8, 0xc23b2e, 0x3d7a4b, 0xe0b33a].map(color => new MeshStandardMaterial({ color, roughness: .45, metalness: .35 }));

export class Arcade {
  readonly props: Prop[] = [];
  readonly pickups: Pickup[] = [];
  combo = 0; comboTimer = 0; bonus = 0; bestCombo = 0; propsDestroyed = 0; strikeCooldown = 0; strikesCalled = 0;
  private readonly group = new Group();
  private nextId = 1; private age = 0;
  constructor(scene: Scene) { this.group.name = 'arcade'; scene.add(this.group); }

  populate(seed: number, centre: Vector3, obstacles: readonly Obstacle[], clusters = 12, cars = 7): void {
    this.clear();
    const rand = random(seed ^ 0x9e3779b1);
    const free = (x: number, z: number): boolean => !blocked(x, z, obstacles, 4.5) && Math.hypot(x - centre.x, z - centre.z) > 22;
    const spot = (min: number, max: number): [number, number] | null => {
      for (let tries = 0; tries < 40; tries++) {
        const angle = rand() * Math.PI * 2, distance = min + rand() * (max - min);
        const x = centre.x + Math.sin(angle) * distance, z = centre.z + Math.cos(angle) * distance;
        if (free(x, z)) return [x, z];
      }
      return null;
    };
    for (let i = 0; i < clusters; i++) {
      const at = spot(28, 120); if (!at) continue;
      for (let b = 0; b < 3; b++) this.add('barrel', at[0] + (b === 0 ? 0 : (b === 1 ? 1.3 : -1.3)), at[1] + (b === 2 ? 1.1 : 0), rand() * 6);
    }
    for (let i = 0; i < cars; i++) {
      const at = spot(32, 130); if (at) this.add('car', at[0], at[1], rand() * Math.PI * 2, Math.floor(rand() * CAR_COLOURS.length));
    }
  }
  private add(kind: PropKind, x: number, z: number, yaw: number, colour = 0): void {
    const root = new Group();
    if (kind === 'barrel') {
      const body = new Mesh(BARREL, MATERIALS.red), band = new Mesh(BAND, MATERIALS.yellow);
      body.position.y = .7; band.position.y = .7; root.add(body, band);
    } else {
      const body = new Mesh(CAR_BODY, CAR_COLOURS[colour % CAR_COLOURS.length]), cabin = new Mesh(CAR_CABIN, MATERIALS.glass);
      body.position.y = .75; cabin.position.set(-.2, 1.5, 0); root.add(body, cabin);
    }
    root.position.set(x, 0, z); root.rotation.y = yaw;
    for (const child of root.children) child.castShadow = true;
    this.group.add(root);
    this.props.push({ id: this.nextId++, kind, x, z, radius: kind === 'barrel' ? 1.05 : 2.4, height: 3.4, alive: true, root });
  }
  /** Nearest live prop crossed by the segment p -> p+step, as a fraction of the step. */
  test(p: Vector3, step: Vector3): { fraction: number; id: number } | null {
    let best: { fraction: number; id: number } | null = null;
    const len2 = step.lengthSq(); if (len2 < 1e-9) return null;
    for (const prop of this.props) {
      if (!prop.alive) continue;
      const cx = prop.x - p.x, cz = prop.z - p.z;
      const t = Math.max(0, Math.min(1, (cx * step.x + cz * step.z) / (step.x * step.x + step.z * step.z || 1)));
      const dx = p.x + step.x * t - prop.x, dz = p.z + step.z * t - prop.z;
      const y = p.y + step.y * t;
      if (dx * dx + dz * dz > prop.radius * prop.radius || y < -.2 || y > prop.height) continue;
      if (!best || t < best.fraction) best = { fraction: Math.max(.001, t), id: prop.id };
    }
    return best;
  }
  prop(id: number): Prop | undefined { return this.props.find(prop => prop.id === id); }
  detonate(prop: Prop): void {
    if (!prop.alive) return;
    prop.alive = false; this.propsDestroyed++;
    for (const child of prop.root.children) if (child instanceof Mesh) child.material = MATERIALS.char;
    prop.root.scale.set(1.05, .35, 1.05); prop.root.rotation.z = (prop.id % 5 - 2) * .06;
  }
  /** Registers a kill: extends the chain and returns the points earned. */
  kill(points = 150): { combo: number; points: number } {
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = COMBO_WINDOW; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const earned = points * comboMultiplier(this.combo);
    this.bonus += earned;
    this.strikeCooldown = Math.max(0, this.strikeCooldown - 3);
    return { combo: this.combo, points: earned };
  }
  dropPickup(kind: PickupKind, x: number, z: number): void {
    const root = new Group(), box = new Mesh(PICKUP_BOX, MATERIALS[kind]), ring = new Mesh(PICKUP_RING, MATERIALS[kind]);
    ring.rotation.x = Math.PI / 2; ring.position.y = .05; box.position.y = 1.2; root.add(box, ring);
    root.position.set(x, 0, z); this.group.add(root);
    this.pickups.push({ kind, x, z, ttl: 22, root });
  }
  update(dt: number, player: Vector3, alive: boolean): PickupKind[] {
    this.age += dt;
    this.comboTimer = Math.max(0, this.comboTimer - dt); if (this.comboTimer === 0) this.combo = 0;
    this.strikeCooldown = Math.max(0, this.strikeCooldown - dt);
    const collected: PickupKind[] = [];
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i]; if (!pickup) continue;
      pickup.ttl -= dt;
      pickup.root.rotation.y += dt * 1.8; pickup.root.position.y = Math.sin(this.age * 3 + pickup.x) * .18;
      if (alive && Math.hypot(pickup.x - player.x, pickup.z - player.z) < 4.2) { collected.push(pickup.kind); this.remove(i); }
      else if (pickup.ttl <= 0) this.remove(i);
    }
    return collected;
  }
  private remove(index: number): void { const [pickup] = this.pickups.splice(index, 1); pickup?.root.removeFromParent(); }
  clear(): void {
    for (const prop of this.props) prop.root.removeFromParent();
    for (const pickup of this.pickups) pickup.root.removeFromParent();
    this.props.length = 0; this.pickups.length = 0;
    this.combo = 0; this.comboTimer = 0; this.bonus = 0; this.bestCombo = 0; this.propsDestroyed = 0; this.strikeCooldown = 0; this.strikesCalled = 0;
  }
  dispose(): void { this.clear(); this.group.removeFromParent(); }
}
