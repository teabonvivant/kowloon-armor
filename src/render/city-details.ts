import * as THREE from 'three';
import type { CityBlock } from './geo-buildings';
import { GeometryBatch, glowMaterial, metalMaterial, windowMaterial } from './materials';
import { addProjectingSigns, HkContext } from './hk-street';
import type { SignStyle } from './materials';

export const shopSigns: readonly SignStyle[] = [
  { text: '龍城茶餐廳', subtitle: 'LUNG SHING CAFE', background: '#1d4b40', foreground: '#e8dab0' },
  { text: '九龍大藥房', subtitle: 'KOWLOON DISPENSARY', background: '#7b392f', foreground: '#ece0c3' },
  { text: '永發五金', subtitle: 'WING FAT HARDWARE', background: '#d1bb87', foreground: '#273f38' },
  { text: '上海理髮', subtitle: 'SHANGHAI BARBER', background: '#253f51', foreground: '#e4d9b5' },
  { text: '金記燒臘', subtitle: 'KAM KEE ROAST', background: '#783d2e', foreground: '#f0cc73' },
  { text: '新興電器', subtitle: 'SUN HING ELECTRICAL', background: '#294d47', foreground: '#ede0bc' },
  { text: '美都餅家', subtitle: 'MEI TO BAKERY', background: '#aa9476', foreground: '#4a302c' },
  { text: '福興找換', subtitle: 'FOOK HING EXCHANGE', background: '#343d3b', foreground: '#d9bc77' },
];
export const streetSigns: readonly SignStyle[] = [
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

export function createCityDetails(blocks: readonly CityBlock[], ctx: HkContext = new HkContext(false)): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Bilingual shopfronts and street furniture';
  const surfaces = new GeometryBatch();
  const glass = new GeometryBatch(windowMaterial);
  const metal = new GeometryBatch(metalMaterial);
  const lights = new GeometryBatch(glowMaterial);
  // v1.9: all shop / street / projecting signs share one atlas (one draw call); see hk-street.ts
  const signMatrix = new THREE.Matrix4(), signTransform = new THREE.Object3D();
  const addSign = (slot: string, x: number, y: number, z: number, width: number, height: number, yaw: number, group = 0): void => {
    signTransform.position.set(x, y, z); signTransform.rotation.set(0, yaw, 0); signTransform.scale.set(width, height, 1); signTransform.updateMatrix();
    ctx.atlas.add(slot, signMatrix.copy(signTransform.matrix), group);
  };
  shopSigns.forEach((style, index) => ctx.atlas.define(`shop-${index}`, style, 512, 128));
  streetSigns.forEach((style, index) => ctx.atlas.define(`street-${index}`, style, 512, 128));
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
        const slot = (placement.index + shop + 16) % shopSigns.length;
        addSign(`shop-${slot}`, x + sin * 0.16, 4.68, z + cos * 0.16, 7.88, 1.77, placement.yaw, slot);
        for (const edge of [-1, 0, 1]) metal.box({ position: [x + cos * edge * 3.88, 2.1, z - sin * edge * 3.88], scale: [0.1, 3.8, 0.11], rotation: [0, placement.yaw, 0] }, 0x7e8778);
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
      lights.box({ position: [poleX, 3.82, poleZ - side * 0.19], scale: [0.13, 0.13, 0.03] }, 0xab553b); // v1.9: box lamp (12 tris) instead of a 288-tri sphere
      lights.box({ position: [poleX, 3.47, poleZ - side * 0.19], scale: [0.13, 0.13, 0.03] }, 0x84b490);
    }
    const roadIndex = Math.abs(Math.floor(x / 84)) % streetSigns.length;
    addSign(`street-${roadIndex}`, x + 10.65, 3.1, z - 14.5, 3.6, 0.91, -Math.PI / 2, roadIndex);
    addSign(`street-${roadIndex}`, x + 10.69, 3.1, z - 14.5, 3.6, 0.91, Math.PI / 2, roadIndex);
    metal.cylinder({ position: [x + 10.67, 1.67, z - 14.5], scale: [0.067, 3.34, 0.067] }, 0x7b8174);
  }
  surfaces.finish(group);
  glass.finish(group, false);
  metal.finish(group, false, 168);
  lights.finish(group, false);
  addProjectingSigns(ctx, blocks);
  return group;
}
