import * as THREE from 'three';
import { createCityDetails } from './city-details';
import { createBuildings } from './geo-buildings';
import type { CityBlock } from './geo-buildings';
import { createParkedVehicles } from './geo-vehicles';
import { createAsphaltMaterial, GeometryBatch } from './materials';
import { createStreetProps } from './street-props';
import { createDistrictLandmarks } from './districts';

export interface Obstacle {
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
}

export interface WorldData {
  readonly obstacles: readonly Obstacle[];
  readonly size: number;
  readonly group: THREE.Group;
}

const roadCenters = [-168, -84, 0, 84, 168] as const;
const blockCenters = [-210, -126, -42, 42, 126, 210] as const;

export function createWorld(): WorldData {
  const group = new THREE.Group();
  group.name = '九龍 · Kowloon';
  const paving = new GeometryBatch();
  const markings = new GeometryBatch();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), createAsphaltMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const blocks: CityBlock[] = [];
  const obstacles: Obstacle[] = [];
  for (const x of blockCenters) for (const z of blockCenters) {
    const width = Math.abs(x) > 180 ? 37 : 58;
    const depth = Math.abs(z) > 180 ? 37 : 58;
    blocks.push({ x, z, width, depth, index: blocks.length });
    obstacles.push({ x, z, halfX: width / 2, halfZ: depth / 2 });
    paving.box({ position: [x, 0.05, z], scale: [width + 4.8, 0.19, depth + 4.8] }, 0x989b8c);
    for (const side of [-1, 1]) {
      paving.box({ position: [x + side * (width / 2 + 2.3), 0.18, z], scale: [0.25, 0.18, depth + 4.8] }, 0xb7b6a5);
      paving.box({ position: [x, 0.18, z + side * (depth / 2 + 2.3)], scale: [width + 4.8, 0.18, 0.25] }, 0xb7b6a5);
      for (let tile = -depth / 2; tile < depth / 2; tile += 3.1) {
        markings.box({ position: [x + side * (width / 2 + 1.15), 0.15, z + tile], scale: [2.2, 0.009, 0.035] }, 0x747e70);
      }
    }
  }
  for (const road of roadCenters) {
    for (let run = -226; run < 226; run += 8) {
      const inJunction = roadCenters.some((crossing) => Math.abs(run - crossing) < 15);
      if (inJunction) continue;
      markings.box({ position: [road, 0.016, run], scale: [0.15, 0.015, 3.7] }, 0xd7d5bd);
      markings.box({ position: [run, 0.016, road], scale: [3.7, 0.015, 0.15] }, 0xd7d5bd);
      for (const side of [-1, 1]) {
        markings.box({ position: [road + side * 9.82, 0.02, run], scale: [0.14, 0.015, 7.94] }, 0xb49d5a);
        markings.box({ position: [road + side * 10.17, 0.02, run], scale: [0.14, 0.015, 7.94] }, 0xb49d5a);
        markings.box({ position: [run, 0.02, road + side * 9.82], scale: [7.94, 0.015, 0.14] }, 0xb49d5a);
        markings.box({ position: [run, 0.02, road + side * 10.17], scale: [7.94, 0.015, 0.14] }, 0xb49d5a);
      }
    }
  }
  for (const x of roadCenters) for (const z of roadCenters) {
    for (const side of [-1, 1]) {
      for (let stripe = -9; stripe <= 9; stripe += 2) {
        markings.box({ position: [x + stripe, 0.022, z + side * 14.1], scale: [1.15, 0.018, 3.1] }, 0xc7b779);
        markings.box({ position: [x + side * 14.1, 0.022, z + stripe], scale: [3.1, 0.018, 1.15] }, 0xc7b779);
      }
      markings.box({ position: [x + side * 5, 0.024, z + side * 18], scale: [8.8, 0.018, 0.22] }, 0xd6d1b5);
    }
  }
  paving.finish(group);
  markings.finish(group, false, 84);
  group.add(createBuildings(blocks), createCityDetails(blocks), createBackdrop(), createDistrictLandmarks());
  obstacles.push(...createParkedVehicles(group));
  const props = createStreetProps(); group.add(props.group); obstacles.push(...props.obstacles);
  group.updateMatrixWorld(true);
  group.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
  return { group, obstacles, size: 460 };
}

function createBackdrop(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Lion Rock skyline';
  const skyline = new GeometryBatch();
  const mountains = new GeometryBatch(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
  const peak = new THREE.ConeGeometry(1, 1, 7);
  for (let index = 0; index < 13; index++) {
    const x = -500 + index * 84;
    mountains.add(peak, { position: [x, 31 + index % 3 * 9, -365 - index % 2 * 25], scale: [115, 70 + index % 3 * 18, 99], rotation: [0, index * 0.7, 0] }, 0x777f72);
  }
  for (let index = 0; index < 30; index++) {
    const x = -390 + index * 27;
    const height = 24 + index * 19 % 73;
    skyline.box({ position: [x, height / 2, -268 - index % 4 * 9], scale: [20, height, 22] }, 0x92978a);
    skyline.box({ position: [-265 - index % 3 * 13, height / 2, x], scale: [20, height, 22] }, 0x999a8b);
    skyline.box({ position: [269 + index % 4 * 9, height / 2, x], scale: [20, height, 22] }, 0x98998b);
  }
  mountains.finish(group, false);
  skyline.finish(group, false);
  return group;
}
