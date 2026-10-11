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
  dirt.finish(hull, false); hullMarks.finish(hull, false); equipment.finish(hull); markings.finish(turret, false);
  stowage.finish(turret); straps.finish(turret);
}
