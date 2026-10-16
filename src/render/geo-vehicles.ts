import * as THREE from 'three';
import { HkContext } from './hk-street';
import type { Obstacle } from './world';

interface ParkedVehicle {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly kind: 'taxi' | 'bus' | 'minibus';
  readonly roof?: number;
}

const parkedVehicles: readonly ParkedVehicle[] = [
  { x: 9, z: 47, yaw: 0, kind: 'taxi' },
  { x: -75, z: 111, yaw: 0, kind: 'taxi' },
  { x: 128, z: 75, yaw: Math.PI / 2, kind: 'bus' },
  { x: -125, z: -75, yaw: Math.PI / 2, kind: 'taxi' },
  { x: -9, z: -129, yaw: Math.PI, kind: 'bus' },
  { x: 75, z: -31, yaw: Math.PI, kind: 'taxi' },
];
/** v1.9 additions (only when the HK extras are on): cream minibuses with red or green roofs, parked at kerbs mid-block. */
const parkedMinibuses: readonly ParkedVehicle[] = [
  { x: -93, z: 40, yaw: 0, kind: 'minibus', roof: 0xc23b2e },
  { x: 177, z: -45, yaw: 0, kind: 'minibus', roof: 0x2e8b57 },
  { x: 9, z: -47, yaw: Math.PI, kind: 'minibus', roof: 0xc23b2e },
  { x: -177, z: 60, yaw: 0, kind: 'minibus', roof: 0x2e8b57 },
];

/** All vehicles share the context batches (3 draw calls for the whole fleet instead of ~3 per vehicle). */
export function createParkedVehicles(group: THREE.Group, context?: HkContext): readonly Obstacle[] {
  const obstacles: Obstacle[] = [];
  const ctx = context ?? new HkContext(false);
  const body = ctx.solid, glass = ctx.glass, trim = ctx.metal, glow = ctx.glow;
  const base = new THREE.Matrix4(), turn = new THREE.Matrix4();
  const fleet = ctx.extras ? [...parkedVehicles, ...parkedMinibuses.filter(vehicle => {
    const swap = Math.abs(Math.sin(vehicle.yaw)) > .5;
    return ctx.isFree(vehicle.x, vehicle.z, swap ? 2.7 : 1, swap ? 1 : 2.7, .8);
  })] : parkedVehicles;
  for (const vehicle of fleet) {
    base.makeTranslation(vehicle.x, 0, vehicle.z).multiply(turn.makeRotationY(vehicle.yaw));
    const placed = base.clone();
    body.base = glass.base = trim.base = glow.base = placed;
    const size = vehicle.kind === 'bus' ? [2.55, 4.2, 10.9] as const : vehicle.kind === 'minibus' ? [2.0, 2.2, 5.4] as const : [2.03, 1.42, 4.7] as const;
    switch (vehicle.kind) {
      case 'taxi':
        body.box({ position: [0, 0.82, 0], scale: [2, 0.78, 4.7] }, 0xb8322a);
        body.box({ position: [0, 1.42, 0.24], scale: [1.78, 0.85, 2.55] }, 0xd9dcd8);
        glass.box({ position: [0, 1.48, -1.049], scale: [1.68, 0.55, 0.04], rotation: [-0.17, 0, 0] }, 0x374b48);
        glass.box({ position: [0, 1.48, 1.527], scale: [1.68, 0.55, 0.04], rotation: [0.13, 0, 0] }, 0x374b48);
        for (const side of [-1, 1]) {
          glass.box({ position: [side * 0.906, 1.48, 0.24], scale: [0.035, 0.5, 2.2] }, 0x445953);
          body.box({ position: [side * 0.94, 1.48, 0.24], scale: [0.03, 0.61, 0.11] }, 0xa7ae9e);
          trim.box({ position: [side * 0.8, 0.93, -2.365], scale: [0.42, 0.26, 0.04] }, 0xe9ddba);
        }
        glow.box({ position: [0, 1.96, 0.23], scale: [0.67, 0.22, 0.28] }, 0xf3ecc9);
        trim.box({ position: [0, 0.62, -2.38], scale: [1.97, 0.1, 0.12] }, 0xadae9d);
        break;
      case 'minibus':
        body.box({ position: [0, 1.0, 0], scale: [2, 1.2, 5.4] }, 0xe9e3d0);
        body.box({ position: [0, 1.88, 0], scale: [1.96, 0.62, 5.3] }, 0xe9e3d0);
        body.box({ position: [0, 2.24, 0], scale: [2.02, 0.16, 5.4] }, vehicle.roof ?? 0xc23b2e);
        body.box({ position: [0, 0.62, 0], scale: [2.04, 0.18, 5.44] }, vehicle.roof ?? 0xc23b2e);
        for (const side of [-1, 1]) for (let window = 0; window < 4; window++) {
          glass.box({ position: [side * 1.0, 1.9, -1.9 + window * 1.25], scale: [0.03, 0.46, 1.0] }, 0x334a48);
        }
        glass.box({ position: [0, 1.82, -2.66], scale: [1.74, 0.52, 0.04] }, 0x2f4543);
        glow.box({ position: [0, 2.12, -2.69], scale: [1.1, 0.16, 0.04] }, 0xffb347);
        trim.box({ position: [0, 0.5, -2.74], scale: [1.9, 0.12, 0.1] }, 0xadae9d);
        break;
      case 'bus':
        body.box({ position: [0, 2.43, 0], scale: [2.55, 3.96, 10.9] }, 0xbbaa83);
        body.box({ position: [0, 0.91, 0], scale: [2.59, 0.75, 10.96] }, 0x955644);
        for (const side of [-1, 1]) {
          for (let index = 0; index < 7; index++) {
            const z = -4.3 + index * 1.42;
            glass.box({ position: [side * 1.29, 3.51, z], scale: [0.025, 1.14, 1.2] }, 0x344a45);
            glass.box({ position: [side * 1.29, 1.9, z], scale: [0.025, 1.01, 1.2] }, 0x3d5048);
          }
          body.box({ position: [side * 1.3, 2.68, 0], scale: [0.03, 0.23, 10.8] }, 0xd6c9a6);
        }
        glass.box({ position: [0, 3.49, -5.48], scale: [2.35, 1.17, 0.035] }, 0x314844);
        glass.box({ position: [0, 1.97, -5.48], scale: [2.35, 1.03, 0.035] }, 0x354c47);
        body.box({ position: [0, 4.15, -5.49], scale: [2.16, 0.27, 0.04] }, 0x292f29);
        body.box({ position: [0, 4.15, -5.515], scale: [1.52, 0.09, 0.025] }, 0xd7b369);
        break;
      default: {
        const impossible: never = vehicle.kind;
        throw new TypeError(`Unexpected vehicle kind: ${String(impossible)}`);
      }
    }
    const axle = size[2] * 0.31;
    for (const side of [-1, 1]) for (const z of [-axle, axle]) {
      trim.cylinder({ position: [side * (size[0] / 2 - 0.06), 0.5, z], scale: [0.45, 0.28, 0.45], rotation: [0, 0, Math.PI / 2] }, 0x282e2a);
      trim.cylinder({ position: [side * size[0] / 2, 0.5, z], scale: [0.26, 0.07, 0.26], rotation: [0, 0, Math.PI / 2] }, 0x8e9787);
    }
    body.base = glass.base = trim.base = glow.base = null;
    ctx.anchor(vehicle.kind, vehicle.x, vehicle.z, vehicle.yaw, 0, { roof: vehicle.roof });
    const rotated = Math.abs(Math.sin(vehicle.yaw)) > 0.5;
    const obstacle: Obstacle = { x: vehicle.x, z: vehicle.z, halfX: (rotated ? size[2] : size[0]) / 2, halfZ: (rotated ? size[0] : size[2]) / 2, surface: 'metal' };
    obstacles.push(obstacle);
  }
  if (!context) ctx.finish(group);
  return obstacles;
}
