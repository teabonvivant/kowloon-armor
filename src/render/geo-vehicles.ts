import * as THREE from 'three';
import { GeometryBatch, metalMaterial, windowMaterial } from './materials';
import type { Obstacle } from './world';

interface ParkedVehicle {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly kind: 'taxi' | 'bus';
}

const parkedVehicles: readonly ParkedVehicle[] = [
  { x: 9, z: 47, yaw: 0, kind: 'taxi' },
  { x: -75, z: 111, yaw: 0, kind: 'taxi' },
  { x: 128, z: 75, yaw: Math.PI / 2, kind: 'bus' },
  { x: -125, z: -75, yaw: Math.PI / 2, kind: 'taxi' },
  { x: -9, z: -129, yaw: Math.PI, kind: 'bus' },
  { x: 75, z: -31, yaw: Math.PI, kind: 'taxi' },
];

export function createParkedVehicles(group: THREE.Group): readonly Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const vehicle of parkedVehicles) {
    const body = new GeometryBatch();
    const glass = new GeometryBatch(windowMaterial);
    const trim = new GeometryBatch(metalMaterial);
    const visual = new THREE.Group();
    visual.position.set(vehicle.x, 0, vehicle.z);
    visual.rotation.y = vehicle.yaw;
    const size = vehicle.kind === 'bus' ? [2.55, 4.2, 10.9] as const : [2.03, 1.42, 4.7] as const;
    switch (vehicle.kind) {
      case 'taxi':
        body.box({ position: [0, 0.82, 0], scale: [2, 0.78, 4.7] }, 0xa93e33);
        body.box({ position: [0, 1.42, 0.24], scale: [1.78, 0.85, 2.55] }, 0xcecfc1);
        glass.box({ position: [0, 1.48, -1.049], scale: [1.68, 0.55, 0.04], rotation: [-0.17, 0, 0] }, 0x374b48);
        glass.box({ position: [0, 1.48, 1.527], scale: [1.68, 0.55, 0.04], rotation: [0.13, 0, 0] }, 0x374b48);
        for (const side of [-1, 1]) {
          glass.box({ position: [side * 0.906, 1.48, 0.24], scale: [0.035, 0.5, 2.2] }, 0x445953);
          body.box({ position: [side * 0.94, 1.48, 0.24], scale: [0.03, 0.61, 0.11] }, 0xa7ae9e);
          trim.box({ position: [side * 0.8, 0.93, -2.365], scale: [0.42, 0.26, 0.04] }, 0xe9ddba);
        }
        body.box({ position: [0, 1.96, 0.23], scale: [0.67, 0.22, 0.28] }, 0xe9e4ca);
        trim.box({ position: [0, 0.62, -2.38], scale: [1.97, 0.1, 0.12] }, 0xadae9d);
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
    body.finish(visual);
    glass.finish(visual, false);
    trim.finish(visual);
    group.add(visual);
    const rotated = Math.abs(Math.sin(vehicle.yaw)) > 0.5;
    obstacles.push({ x: vehicle.x, z: vehicle.z, halfX: (rotated ? size[2] : size[0]) / 2, halfZ: (rotated ? size[0] : size[2]) / 2, surface: 'metal' });
  }
  return obstacles;
}
