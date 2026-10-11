import * as THREE from 'three';
import { GeometryBatch, metalMaterial, windowMaterial } from './materials';

export interface CityBlock {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly index: number;
}

interface Tower {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly index: number;
}

const concreteColors = [0x96998d, 0xa9a397, 0x899b99, 0xb8aea0, 0x918e7e, 0x778e86] as const;
const glassColors = [0x455751, 0x5c706a, 0x72867c, 0x374d4b, 0xa69c75] as const;

export function createBuildings(blocks: readonly CityBlock[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Kowloon concrete towers';
  const concrete = new GeometryBatch();
  const glass = new GeometryBatch(windowMaterial);
  const metal = new GeometryBatch(metalMaterial);
  for (const block of blocks) {
    concrete.box({ position: [block.x, 3.3, block.z], scale: [block.width, 6.4, block.depth] }, 0x777e74);
    concrete.box({ position: [block.x, 6.63, block.z], scale: [block.width + 0.35, 0.24, block.depth + 0.35] }, 0xa1a193);
    const width = (block.width - 2.4) / 2;
    for (const side of [-1, 1]) {
      const index = block.index * 2 + (side + 1) / 2;
      const tower: Tower = { x: block.x + side * (width / 2 + 0.65), z: block.z + ((index % 3) - 1) * 1.5, width, depth: block.depth - 5, height: 22 + (index * 17 % 38), index };
      addTower(tower, concrete, glass);
      addRooftop(tower, concrete, metal);
    }
  }
  concrete.finish(group);
  glass.finish(group, false);
  metal.finish(group);
  return group;
}

function addTower(tower: Tower, concrete: GeometryBatch, glass: GeometryBatch): void {
  const color = concreteColors[tower.index % concreteColors.length] ?? 0x96998d;
  concrete.box({ position: [tower.x, tower.height / 2 + 6.6, tower.z], scale: [tower.width, tower.height, tower.depth] }, color);
  const floors = Math.floor(tower.height / 3.15);
  for (let floor = 0; floor < floors; floor++) {
    const y = 8.5 + floor * 3.15;
    for (const side of [-1, 1]) {
      for (let column = 0; column < Math.floor(tower.width / 3.3); column++) {
        const x = tower.x - tower.width / 2 + 2 + column * 3.35;
        const z = tower.z + side * (tower.depth / 2 + 0.055);
        const tone = glassColors[(floor * 7 + column * 3 + tower.index) % glassColors.length] ?? 0x455751;
        glass.box({ position: [x, y, z], scale: [2.18, 1.8, 0.1] }, tone);
        concrete.box({ position: [x, y - 0.99, z], scale: [2.38, 0.16, 0.18] }, 0xb1ae9f);
        concrete.box({ position: [x, y, z + side * 0.01], scale: [0.09, 1.88, 0.12] }, color);
        if ((floor + column) % 3 === 0) {
          concrete.box({ position: [x + 0.35, y - 0.85, z + side * 0.36], scale: [0.85, 0.62, 0.6] }, 0xbab9aa);
          glass.box({ position: [x + 0.35, y - 0.85, z + side * 0.68], scale: [0.66, 0.38, 0.03] }, 0x626e63);
        }
      }
      for (let column = 0; column < Math.floor(tower.depth / 3.65); column++) {
        const z = tower.z - tower.depth / 2 + 2.1 + column * 3.65;
        const x = tower.x + side * (tower.width / 2 + 0.055);
        const tone = glassColors[(floor * 3 + column + tower.index) % glassColors.length] ?? 0x455751;
        glass.box({ position: [x, y, z], scale: [0.1, 1.87, 2.42] }, tone);
        concrete.box({ position: [x, y - 1.04, z], scale: [0.18, 0.17, 2.58] }, 0xb1ae9f);
        concrete.box({ position: [x + side * 0.03, y, z], scale: [0.12, 1.93, 0.1] }, color);
        if ((column + floor + tower.index) % 4 === 0) concrete.box({ position: [x + side * 0.39, y - 0.8, z + 0.5], scale: [0.65, 0.6, 0.92] }, 0xb6b8a9);
      }
      if (floor % 4 === 0) concrete.box({ position: [tower.x + side * (tower.width / 2 + 0.09), y + 1.46, tower.z], scale: [0.18, 0.23, tower.depth + 0.1] }, 0x797f73);
    }
  }
  for (const side of [-1, 1]) {
    concrete.box({ position: [tower.x + side * (tower.width / 2 - 0.55), 6.6 + tower.height / 2, tower.z], scale: [0.6, tower.height, tower.depth + 0.12] }, new THREE.Color(color).multiplyScalar(0.86));
    concrete.box({ position: [tower.x, 6.7 + tower.height, tower.z + side * tower.depth / 2], scale: [tower.width + 0.35, 0.68, 0.24] }, 0xc0bbae);
  }
}

function addRooftop(tower: Tower, concrete: GeometryBatch, metal: GeometryBatch): void {
  const y = tower.height + 6.6;
  concrete.box({ position: [tower.x + 1.8, y + 1.3, tower.z + 2], scale: [tower.width * 0.47, 2.6, 6.5] }, 0x7d8478);
  for (const side of [-1, 1]) {
    metal.cylinder({ position: [tower.x - tower.width * 0.2, y + 1.75, tower.z + side * 4.8], scale: [1.2, 3.2, 1.2] }, 0x9da296);
    metal.cylinder({ position: [tower.x - tower.width * 0.2, y + 3.42, tower.z + side * 4.8], scale: [1.23, 0.12, 1.23] }, 0xc3c4b7);
    metal.box({ position: [tower.x + tower.width * 0.2, y + 0.56, tower.z - 5.5], scale: [3.9, 1.12, 2.6] }, 0x667367);
  }
  metal.cylinder({ position: [tower.x + tower.width * 0.24, y + 3.5, tower.z + 3.3], scale: [0.055, 7, 0.055] }, 0x616b62);
  metal.box({ position: [tower.x + tower.width * 0.24, y + 6, tower.z + 3.3], scale: [2, 0.04, 0.05] }, 0x616b62);
}
