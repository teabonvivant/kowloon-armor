import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';
import { blocked, wallFraction } from './math';
import type { Obstacle } from './render/world';
import type { PropKind } from './game-events-v19';

export type { PropKind } from './game-events-v19';
export type PickupKind = 'repair' | 'rapid';
/** `fuse` (tanker leak), `burn` (wreck fire) and `flight` (thrown body) are run-time state; fixtures may omit them. */
export interface Prop {
  readonly id: number; readonly kind: PropKind; readonly x: number; readonly z: number; readonly radius: number; readonly height: number;
  alive: boolean; readonly root: Object3D; fuse?: boolean; burn?: number; burnTotal?: number; opening?: boolean;
  flight?: { age: number; duration: number; height: number; spin: number };
}
export interface Pickup { readonly kind: PickupKind; readonly x: number; readonly z: number; ttl: number; readonly root: Object3D }

export const COMBO_WINDOW = 5;
export const STRIKE_COOLDOWN = 32;
export const STRIKE_SHELLS = 7;
export const COMBO_CAP = 6;
export function comboMultiplier(combo: number): number { return Math.min(COMBO_CAP, Math.max(1, combo)); }

/** Sortie grade from the arcade counters only (no new save fields). */
export function arcadeRating(stats: { propsDestroyed: number; bestCombo: number; bestChain: number }): 'S' | 'A' | 'B' {
  if (stats.propsDestroyed >= 8 && stats.bestChain >= 4 && stats.bestCombo >= 4) return 'S';
  if (stats.propsDestroyed >= 4 && (stats.bestChain >= 3 || stats.bestCombo >= 3)) return 'A';
  return 'B';
}

export interface Placement { kind: PropKind; x: number; z: number; yaw: number; variant: number }
export interface OpeningGroup { centre: { x: number; z: number }; distance: number; members: Placement[] }
export interface OpeningOptions {
  /** Distance bands (m) ahead of the spawn for the first and second group. */
  near?: readonly [number, number]; far?: readonly [number, number];
  /** Enemy approach lanes (segments from the spawn) that the corridor and scatter must keep clear of. */
  lanes?: readonly (readonly [number, number])[];
}
/** Minimum distance (m) between a straight shell lane to an enemy and a corridor member (car radius 2.4 + 1.2 m margin). */
export const LANE_CLEARANCE_CORRIDOR = 3.6;
/** Same for scattered props, which have no placement guarantee and so keep a wider berth. */
export const LANE_CLEARANCE_SCATTER = 6;
/** Distance from a point to the segment centre -> end (2-D). */
export function laneDistance(x: number, z: number, cx: number, cz: number, ex: number, ez: number): number {
  const dx = ex - cx, dz = ez - cz, len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - cx) * dx + (z - cz) * dz) / len2));
  return Math.hypot(cx + dx * t - x, cz + dz * t - z);
}
/**
 * Deterministic opening corridor: a group of three LPG cylinders and a taxi 25-50 m ahead of the spawn (heading -z),
 * and a second group (tanker + LPG) 70-110 m ahead. Members are within 6 m of each other so one hit chains the group;
 * every member is free of obstacles (4.5 m margin) and in clear line of sight of the spawn.
 */
export function openingGroups(seed: number, centre: { x: number; z: number }, obstacles: readonly Obstacle[], options: OpeningOptions = {}): OpeningGroup[] {
  const rand = random(seed ^ 0x2f6e2b1);
  const lanes = options.lanes ?? [];
  const bands = [options.near ?? [28, 48], options.far ?? [70, 110]] as const;
  const result: OpeningGroup[] = [];
  /** `side` (+1/-1) is the outward direction from the spawn road axis, so group members never straddle the shell lane. */
  const members = (c: { x: number; z: number }, second: boolean, side: number): Placement[] => second
    ? [{ kind: 'tanker', x: c.x, z: c.z, yaw: Math.PI / 2, variant: 0 }, { kind: 'lpg', x: c.x + side * 2.8, z: c.z + .8, yaw: 0, variant: 0 }, { kind: 'lpg', x: c.x + side * 3.4, z: c.z - .6, yaw: 0, variant: 0 }]
    : [{ kind: 'lpg', x: c.x, z: c.z, yaw: 0, variant: 0 }, { kind: 'lpg', x: c.x + side * 1.3, z: c.z, yaw: 0, variant: 0 },
      { kind: 'lpg', x: c.x + side * 1.3, z: c.z + 1.4, yaw: 0, variant: 0 }, { kind: 'car', x: c.x + side * .4, z: c.z - 4.2, yaw: Math.PI / 2 + (rand() - .5) * .3, variant: 0 }];
  const valid = (group: Placement[], needSight: boolean): boolean => group.every(m => {
    if (blocked(m.x, m.z, obstacles, 4.5)) return false;
    if (Math.hypot(m.x - centre.x, m.z - centre.z) < 22) return false;
    if (lanes.some(lane => laneDistance(m.x, m.z, centre.x, centre.z, lane[0], lane[1]) < LANE_CLEARANCE_CORRIDOR)) return false;
    return !needSight || wallFraction(centre.x, centre.z, m.x - centre.x, m.z - centre.z, obstacles) === 1;
  });
  for (const [index, band] of bands.entries()) {
    const second = index === 1;
    let found: OpeningGroup | null = null;
    const attempt = (distance: number, lateral: number, sight: boolean): boolean => {
      const c = { x: centre.x + lateral, z: centre.z - distance }, group = members(c, second, lateral >= 0 ? 1 : -1);
      if (!valid(group, sight)) return false;
      found = { centre: c, distance, members: group }; return true;
    };
    for (let tries = 0; tries < 80 && !found; tries++) {
      const distance = band[0] + rand() * (band[1] - band[0]);
      const reach = Math.min(second ? 14 : 7.5, distance * .26), lateral = (rand() < .5 ? -1 : 1) * (4.5 + rand() * Math.max(0, reach - 4.5));
      attempt(distance, lateral, true);
    }
    // Deterministic sweep: widest-first so a straight shell lane stays clear when the street allows it.
    for (let distance = band[0]; distance <= band[1] && !found; distance += 2) {
      for (const lateral of [5, -5, 6.5, -6.5, 8, -8, 3.5, -3.5, 2, -2, 0, 10, -10, 12, -12]) if (attempt(distance, lateral, true)) break;
    }
    if (found) result.push(found);
  }
  return result;
}

function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const BARREL = new CylinderGeometry(.55, .55, 1.4, 12);
const BAND = new CylinderGeometry(.57, .57, .28, 12);
const LPG_TANK = new CylinderGeometry(.34, .34, .95, 10);
const TANKER_BODY = new CylinderGeometry(1.15, 1.15, 5.4, 12).rotateZ(Math.PI / 2);
const MINIBUS_BODY = new BoxGeometry(5.1, 1.5, 2.0);
const TRANSFORMER_BODY = new BoxGeometry(1.5, 2.1, 1.3);
const CAR_BODY = new BoxGeometry(4.2, 1.05, 1.9);
const CAR_CABIN = new BoxGeometry(2.1, .8, 1.7);
const PICKUP_BOX = new BoxGeometry(1.1, 1.1, 1.1);
const PICKUP_RING = new TorusGeometry(1.25, .08, 6, 24);
const MATERIALS = {
  red: new MeshStandardMaterial({ color: 0xb02a1e, roughness: .55, metalness: .3 }),
  yellow: new MeshStandardMaterial({ color: 0xf2c230, roughness: .5, emissive: 0x3a2a00 }),
  char: new MeshStandardMaterial({ color: 0x1b1a18, roughness: 1 }),
  lpg: new MeshStandardMaterial({ color: 0xc9ccd0, roughness: .5, metalness: .4 }),
  silver: new MeshStandardMaterial({ color: 0xb8bcc0, roughness: .4, metalness: .6 }),
  taxi: new MeshStandardMaterial({ color: 0xc8261b, roughness: .45, metalness: .35 }),
  minibus: new MeshStandardMaterial({ color: 0xe8e2cf, roughness: .5, metalness: .3 }),
  grey: new MeshStandardMaterial({ color: 0x5b6168, roughness: .7, metalness: .3 }),
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

  /** Property ids of the guided opening groups (first group first), for HUD guidance. */
  opening: Prop[][] = [];
  populate(seed: number, centre: Vector3, obstacles: readonly Obstacle[], clusters = 12, cars = 7, options: (OpeningOptions & { opening?: boolean }) = {}): void {
    this.clear();
    const rand = random(seed ^ 0x9e3779b1);
    const lanes = options.lanes ?? [];
    const free = (x: number, z: number): boolean => !blocked(x, z, obstacles, 4.5) && Math.hypot(x - centre.x, z - centre.z) > 22 &&
      !lanes.some(lane => laneDistance(x, z, centre.x, centre.z, lane[0], lane[1]) < LANE_CLEARANCE_SCATTER);
    const spot = (min: number, max: number): [number, number] | null => {
      for (let tries = 0; tries < 40; tries++) {
        const angle = rand() * Math.PI * 2, distance = min + rand() * (max - min);
        const x = centre.x + Math.sin(angle) * distance, z = centre.z + Math.cos(angle) * distance;
        if (free(x, z)) return [x, z];
      }
      return null;
    };
    if (options.opening !== false) {
      for (const group of openingGroups(seed, centre, obstacles, options)) {
        const made = group.members.map(m => this.add(m.kind, m.x, m.z, m.yaw, m.variant));
        for (const prop of made) prop.opening = true;
        this.opening.push(made);
      }
    }
    for (let i = 0; i < clusters; i++) {
      const at = spot(28, 120); if (!at) continue;
      const lpg = i % 6 === 5;
      for (let b = 0; b < 3; b++) this.add(lpg ? 'lpg' : 'barrel', at[0] + (b === 0 ? 0 : (b === 1 ? 1.3 : -1.3)), at[1] + (b === 2 ? 1.1 : 0), rand() * 6);
    }
    for (let i = 0; i < cars; i++) {
      const at = spot(32, 130); if (!at) continue;
      const kind: PropKind = i === 2 || i === 5 ? 'minibus' : i === 6 ? 'transformer' : 'car';
      this.add(kind, at[0], at[1], rand() * Math.PI * 2, Math.floor(rand() * CAR_COLOURS.length));
    }
  }
  private add(kind: PropKind, x: number, z: number, yaw: number, colour = 0): Prop {
    const root = new Group();
    const part = (geometry: BoxGeometry | CylinderGeometry, material: MeshStandardMaterial, y: number, px = 0): Mesh => {
      const mesh = new Mesh(geometry, material); mesh.position.set(px, y, 0); root.add(mesh); return mesh;
    };
    if (kind === 'barrel') { part(BARREL, MATERIALS.red, .7); part(BAND, MATERIALS.yellow, .7); }
    else if (kind === 'lpg') { part(LPG_TANK, MATERIALS.lpg, .48); part(BAND, MATERIALS.yellow, .85).scale.set(.6, .35, .6); }
    else if (kind === 'tanker') { part(TANKER_BODY, MATERIALS.silver, 1.5); part(CAR_CABIN, MATERIALS.grey, 1.3, 3.2); }
    else if (kind === 'transformer') { part(TRANSFORMER_BODY, MATERIALS.grey, 1.05); part(BAND, MATERIALS.yellow, 2.2).scale.set(.9, .5, .9); }
    else if (kind === 'minibus') { part(MINIBUS_BODY, MATERIALS.minibus, .95); part(CAR_CABIN, MATERIALS.glass, 1.75, -.3).scale.set(1.5, .8, 1.05); }
    else { part(CAR_BODY, kind === 'car' ? MATERIALS.taxi : CAR_COLOURS[colour % CAR_COLOURS.length] ?? MATERIALS.taxi, .75); part(CAR_CABIN, MATERIALS.glass, 1.5, -.2); }
    root.position.set(x, 0, z); root.rotation.y = yaw;
    for (const child of root.children) child.castShadow = true;
    this.group.add(root);
    const radius = { barrel: 1.05, lpg: .8, car: 2.4, minibus: 2.8, tanker: 3.2, transformer: 1.3 }[kind];
    const prop: Prop = { id: this.nextId++, kind, x, z, radius, height: 3.4, alive: true, root };
    this.props.push(prop);
    return prop;
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
  /** Marks the prop destroyed. Vehicles and cylinders are thrown and tumble; vehicles then burn for 8-12 s. */
  detonate(prop: Prop): void {
    if (!prop.alive) return;
    prop.alive = false; this.propsDestroyed++;
    if (this.chainIdle > 1.5) this.chain = 0;
    this.chain++; this.chainIdle = 0; this.bestChain = Math.max(this.bestChain, this.chain);
    for (const child of prop.root.children) if (child instanceof Mesh) child.material = MATERIALS.char;
    const vehicle = prop.kind === 'car' || prop.kind === 'minibus' || prop.kind === 'tanker';
    if (vehicle || prop.kind === 'lpg') {
      const roll = ((prop.id * 2654435761) >>> 0) / 4294967296;
      prop.flight = { age: 0, duration: .8 + roll * .6, height: vehicle ? 1.5 + roll * 1.5 : 3 + roll * 3, spin: (roll - .5) * 7 };
    } else { prop.root.scale.set(1.05, .35, 1.05); prop.root.rotation.z = (prop.id % 5 - 2) * .06; }
    if (vehicle) { prop.burnTotal = prop.burn = 8 + ((prop.id * 40503) % 5); }
  }
  /** Number of props detonated since the last 1.5 s lull (best value kept in `bestChain`). */
  chain = 0; bestChain = 0; private chainIdle = 0;
  private animate(dt: number): void {
    for (const prop of this.props) {
      const flight = prop.flight;
      if (flight) {
        flight.age = Math.min(flight.duration, flight.age + dt);
        const t = flight.age / flight.duration, arch = 4 * t * (1 - t);
        prop.root.position.y = flight.height * arch; prop.root.rotation.z = flight.spin * t;
        if (t >= 1) {
          delete prop.flight; prop.root.position.y = 0; prop.root.rotation.z = (prop.id % 5 - 2) * .06;
          prop.root.scale.set(1.05, prop.kind === 'lpg' ? .6 : .55, 1.05);
        }
      }
      if (!prop.alive && prop.burn !== undefined && prop.burn > 0) prop.burn = Math.max(0, prop.burn - dt);
    }
    this.chainIdle += dt;
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
    this.age += dt; this.animate(dt);
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
    this.props.length = 0; this.pickups.length = 0; this.opening = []; this.chain = 0; this.bestChain = 0; this.chainIdle = 9;
    this.combo = 0; this.comboTimer = 0; this.bonus = 0; this.bestCombo = 0; this.propsDestroyed = 0; this.strikeCooldown = 0; this.strikesCalled = 0;
  }
  dispose(): void { this.clear(); this.group.removeFromParent(); }
}
