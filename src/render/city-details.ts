import * as THREE from 'three';
import type { CityBlock } from './geo-buildings';
import { createSignMaterial, GeometryBatch, glowMaterial, metalMaterial, unitPlane, windowMaterial } from './materials';
import type { SignStyle } from './materials';

const shopSigns: readonly SignStyle[] = [
  { text: '龍城茶餐廳', subtitle: 'LUNG SHING CAFE', background: '#1d4b40', foreground: '#e8dab0' },
  { text: '九龍大藥房', subtitle: 'KOWLOON DISPENSARY', background: '#7b392f', foreground: '#ece0c3' },
  { text: '永發五金', subtitle: 'WING FAT HARDWARE', background: '#d1bb87', foreground: '#273f38' },
  { text: '上海理髮', subtitle: 'SHANGHAI BARBER', background: '#253f51', foreground: '#e4d9b5' },
  { text: '金記燒臘', subtitle: 'KAM KEE ROAST', background: '#783d2e', foreground: '#f0cc73' },
  { text: '新興電器', subtitle: 'SUN HING ELECTRICAL', background: '#294d47', foreground: '#ede0bc' },
  { text: '美都餅家', subtitle: 'MEI TO BAKERY', background: '#aa9476', foreground: '#4a302c' },
  { text: '福興找換', subtitle: 'FOOK HING EXCHANGE', background: '#343d3b', foreground: '#d9bc77' },
];
const projectingSigns: readonly SignStyle[] = [
  { text: '龍城酒家', subtitle: '', background: '#3e2826', foreground: '#e98b62', vertical: true },
  { text: '九龍賓館', subtitle: '', background: '#253d3a', foreground: '#a5d6b6', vertical: true },
  { text: '華星押', subtitle: '', background: '#562b25', foreground: '#ead59b', vertical: true },
  { text: '金都戲院', subtitle: '', background: '#263741', foreground: '#bad1cd', vertical: true },
];
const streetSigns: readonly SignStyle[] = [
  { text: '彌敦道', subtitle: 'NATHAN ROAD', background: '#244c65', foreground: '#eeeade' },
  { text: '亞皆老街', subtitle: 'ARGYLE STREET', background: '#244c65', foreground: '#eeeade' },
  { text: '窩打老道', subtitle: 'WATERLOO ROAD', background: '#244c65', foreground: '#eeeade' },
  { text: '廣東道', subtitle: 'CANTON ROAD', background: '#244c65', foreground: '#eeeade' },
];

interface ShopPlacement {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly index: number;
  readonly width: number;
}

export function createCityDetails(blocks: readonly CityBlock[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Bilingual shopfronts and street furniture';
  const surfaces = new GeometryBatch();
  const glass = new GeometryBatch(windowMaterial);
  const metal = new GeometryBatch(metalMaterial);
  const lights = new GeometryBatch(glowMaterial);
  const signBatches = shopSigns.map((style) => new GeometryBatch(createSignMaterial(style)));
  const verticalBatches = projectingSigns.map((style) => new GeometryBatch(createSignMaterial(style)));
  const roadBatches = streetSigns.map((style) => new GeometryBatch(createSignMaterial(style)));
  for (const block of blocks) {
    const placements: ShopPlacement[] = [
      { x: block.x, z: block.z - block.depth / 2 - 0.04, yaw: Math.PI, index: block.index, width: block.width },
      { x: block.x, z: block.z + block.depth / 2 + 0.04, yaw: 0, index: block.index + 3, width: block.width },
      { x: block.x - block.width / 2 - 0.04, z: block.z, yaw: -Math.PI / 2, index: block.index + 1, width: block.depth },
      { x: block.x + block.width / 2 + 0.04, z: block.z, yaw: Math.PI / 2, index: block.index + 5, width: block.depth },
    ];
    for (const placement of placements) {
      const cos = Math.cos(placement.yaw);
      const sin = Math.sin(placement.yaw);
      const shopCount = Math.max(2, Math.floor(placement.width / 8.5));
      for (let shop = 0; shop < shopCount; shop++) {
        const offset = (shop - (shopCount - 1) / 2) * 8.5;
        const x = placement.x + cos * offset;
        const z = placement.z - sin * offset;
        glass.box({ position: [x, 2.02, z], scale: [7.8, 3.6, 0.07], rotation: [0, placement.yaw, 0] }, 0x34423c);
        surfaces.box({ position: [x, 0.47, z], scale: [7.9, 0.66, 0.14], rotation: [0, placement.yaw, 0] }, 0x777d70);
        surfaces.box({ position: [x, 3.55, z], scale: [7.92, 0.18, 0.14], rotation: [0, placement.yaw, 0] }, 0x7e8777);
        surfaces.box({ position: [x + sin * 0.74, 3.43, z + cos * 0.74], scale: [8, 0.13, 1.6], rotation: [-0.13, placement.yaw, 0] }, (placement.index + shop) % 2 === 0 ? 0x3d6554 : 0x885849);
        const sign = signBatches[(placement.index + shop + 16) % signBatches.length];
        sign?.add(unitPlane, { position: [x + sin * 0.16, 4.68, z + cos * 0.16], scale: [7.88, 1.77, 1], rotation: [0, placement.yaw, 0] }, 0xffffff);
        for (const edge of [-1, 0, 1]) metal.box({ position: [x + cos * edge * 3.88, 2.1, z - sin * edge * 3.88], scale: [0.1, 3.8, 0.11], rotation: [0, placement.yaw, 0] }, 0x7e8778);
      }
      if (Math.abs(block.x) < 170 && Math.abs(block.z) < 170) {
        const sign = verticalBatches[placement.index % verticalBatches.length];
        sign?.add(unitPlane, { position: [placement.x + sin * 2.1, 8.2, placement.z + cos * 2.1], scale: [1.8, 7.2, 1], rotation: [0, placement.yaw + Math.PI / 2, 0] }, 0xffffff);
        metal.box({ position: [placement.x + sin, 11.45, placement.z + cos], scale: [0.12, 0.13, 3], rotation: [0, placement.yaw, 0] }, 0x38453c);
        metal.box({ position: [placement.x + sin, 4.84, placement.z + cos], scale: [0.12, 0.13, 3], rotation: [0, placement.yaw, 0] }, 0x38453c);
      }
    }
  }
  const roads = [-168, -84, 0, 84, 168] as const;
  for (const x of roads) for (const z of roads) {
    for (const side of [-1, 1]) {
      const poleX = x + side * 10.45;
      const poleZ = z + side * 13.2;
      metal.cylinder({ position: [poleX, 4.05, poleZ], scale: [0.12, 8.1, 0.12] }, 0x616c60);
      metal.box({ position: [poleX - side * 1.35, 8.06, poleZ], scale: [2.88, 0.14, 0.17] }, 0x717a6c);
      lights.box({ position: [poleX - side * 2.55, 7.97, poleZ], scale: [0.92, 0.11, 0.48] }, 0xf1d39e);
      metal.box({ position: [poleX, 3.64, poleZ], scale: [0.3, 0.87, 0.35] }, 0x303a32);
      lights.sphere({ position: [poleX, 3.82, poleZ - side * 0.19], scale: [0.073, 0.073, 0.025] }, 0xab553b);
      lights.sphere({ position: [poleX, 3.47, poleZ - side * 0.19], scale: [0.073, 0.073, 0.025] }, 0x84b490);
    }
    const roadIndex = Math.abs(Math.floor(x / 84)) % roadBatches.length;
    const sign = roadBatches[roadIndex];
    sign?.add(unitPlane, { position: [x + 10.65, 3.1, z - 14.5], scale: [3.6, 0.91, 1], rotation: [0, -Math.PI / 2, 0] }, 0xffffff);
    metal.cylinder({ position: [x + 10.67, 1.67, z - 14.5], scale: [0.067, 3.34, 0.067] }, 0x7b8174);
  }
  surfaces.finish(group);
  glass.finish(group, false);
  metal.finish(group, true, 168);
  lights.finish(group, false);
  for (const batch of [...signBatches, ...verticalBatches, ...roadBatches]) batch.finish(group, false);
  return group;
}
