import { Color, DataTexture, MeshStandardMaterial, RGBAFormat, SRGBColorSpace } from 'three';
import type { Group } from 'three';
import type { TankSpec } from '../data/tanks';
import { GeometryBatch, metalMaterial } from './materials';

function camouflage(): MeshStandardMaterial {
  const size = 96, pixels = new Uint8Array(size * size * 4);
  let seed = 71439;
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const field = Math.sin(column * .105 + Math.sin(row * .16) * 1.8) + Math.cos(row * .115 - column * .06);
    const tone = (field > .9 ? 161 : field > -.4 ? 222 : 248) + (seed % 13) - 6;
    const offset = (row * size + column) * 4;
    pixels[offset] = tone; pixels[offset + 1] = tone; pixels[offset + 2] = tone; pixels[offset + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true;
  return new MeshStandardMaterial({ map: texture, roughness: .84, metalness: .19 });
}
export const tankPaint = camouflage();

const digits = ['abcedf', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd'];
const segments = {
  a: [0, .23, true], b: [.09, .115, false], c: [.09, -.115, false], d: [0, -.23, true],
  e: [-.09, -.115, false], f: [-.09, .115, false], g: [0, 0, true],
} as const;

export function addTankDetails(hull: Group, turret: Group, spec: TankSpec): void {
  const paint = new Color(spec.color);
  const dirt = new GeometryBatch();
  const equipment = new GeometryBatch(metalMaterial);
  const markings = new GeometryBatch();
  const hullMarks = new GeometryBatch();
  let hash = 0; for (const character of spec.id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const serial = String(100 + hash % 800);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 21; index++) {
      const height = .03 + ((index * 13 + hash) % 8) * .018;
      dirt.box({ position: [side * 2.06, 1.18 + height / 2, -2.9 + index * .29], scale: [.017, height, .14 + index % 3 * .05] }, 0x72664e);
    }
    for (const angle of [-.6, .6]) hullMarks.box({ position: [side * 2.059, 1.62, -.87 + (angle > 0 ? .1 : -.1)],
      scale: [.015, .055, .27], rotation: [angle, 0, 0] }, 0xdedbc2);
    for (const [digitIndex, digit] of [...serial].entries()) {
      for (const segment of digits[Number(digit)] ?? '') {
        const coords = segments[segment as keyof typeof segments];
        if (!coords) continue;
        const [offset, height, horizontal] = coords;
        markings.box({ position: [side * 1.616, .28 + height, .15 + digitIndex * .32 + offset],
          scale: [.018, horizontal ? .045 : .19, horizontal ? .18 : .042] }, 0xdedbc2);
      }
    }
    equipment.box({ position: [side * 1.12, 2.12, 2.7], scale: [.43, .36, .65] }, paint.clone().multiplyScalar(.7));
    equipment.box({ position: [side * 1.12, 2.34, 2.7], scale: [.12, .065, .3] }, 0x292d28);
  }
  const straps = new GeometryBatch(metalMaterial);
  const stowage = new GeometryBatch();
  stowage.cylinder({ position: [0, .96, 1.42], scale: [.23, 1.9, .23], rotation: [0, 0, Math.PI / 2] }, 0x897e5b);
  for (const side of [-1, 1]) straps.cylinder({ position: [side * .59, .96, 1.42], scale: [.245, .09, .245], rotation: [0, 0, Math.PI / 2] }, 0x3d4236);
  if (spec.family === 'futuristic') {
    stowage.box({ position: [0, 1.04, -.05], scale: [.55, .62, .55] }, paint);
    straps.box({ position: [0, 1.09, -.337], scale: [.4, .23, .022] }, 0x2c6970);
  }
  if (spec.id === 'leopard2a8') {
    for (const side of [-1, 1]) {
      stowage.box({ position: [side * 1.42, .42, -.93], scale: [.38, .9, 1.45], rotation: [0, side * -.28, -.08 * side] }, paint);
      straps.box({ position: [side * 1.68, .93, .65], scale: [.3, .38, .45] }, 0x38443e);
      markings.box({ position: [side * 1.84, .93, .65], scale: [.025, .2, .27] }, 0x88aaa1);
    }
    stowage.cylinder({ position: [.1, 1.05, .1], scale: [.23, .48, .23] }, paint);
  }
  if (spec.id === 'abrams') {
    for (let slat = 0; slat < 9; slat++) equipment.box({ position: [-1.15 + slat * .285, 1.66, 3.48], scale: [.14, .52, .13] }, 0x353a33);
    straps.box({ position: [0, .57, 1.98], scale: [2.8, .64, .12] }, 0x3c4036);
    for (let rail = 0; rail < 7; rail++) straps.box({ position: [-1.2 + rail * .4, .64, 2.07], scale: [.05, .78, .08] }, 0x8c8870);
    stowage.box({ position: [.74, 1.27, .18], scale: [.72, .6, .9] }, paint);
  }
  if (spec.id === 't90m') {
    for (const side of [-1, 1]) {
      equipment.cylinder({ position: [side * 1.1, 1.62, 3.66], scale: [.42, 1.1, .42], rotation: [0, 0, Math.PI / 2] }, paint);
      for (let plate = 0; plate < 6; plate++) stowage.box({ position: [side * 1.35, .44, -1.25 + plate * .43],
        scale: [.42, .38, .33], rotation: [0, side * -.3, side * .2] }, paint.clone().multiplyScalar(.84));
      straps.box({ position: [side * 1.4, -.36, 1.1], scale: [.13, .64, 1.2] }, 0x444a38);
    }
  }
  if (spec.id === 'merkavabarak') {
    equipment.box({ position: [0, 1.3, 3.47], scale: [1.15, .9, .16] }, paint.clone().multiplyScalar(.75));
    equipment.box({ position: [.4, 1.32, 3.57], scale: [.08, .24, .08] }, 0xabb097);
    for (const side of [-1, 1]) {
      stowage.box({ position: [side * 1.51, .7, .3], scale: [.48, .38, .55] }, paint);
    }
    for (let chain = 0; chain < 7; chain++) {
      straps.cylinder({ position: [-1.17 + chain * .39, -.1, 1.84], scale: [.015, .6, .015] }, 0x44493e);
      straps.sphere({ position: [-1.17 + chain * .39, -.43, 1.84], scale: [.065, .065, .065] }, 0x8c8970);
    }
  }
  dirt.finish(hull, false); hullMarks.finish(hull, false); equipment.finish(hull); markings.finish(turret, false);
  stowage.finish(turret); straps.finish(turret);
}
