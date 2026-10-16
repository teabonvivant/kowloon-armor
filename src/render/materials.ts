import * as THREE from 'three';

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
export const unitSphere = new THREE.SphereGeometry(1, 16, 10);
export const unitPlane = new THREE.PlaneGeometry(1, 1);
export const solidMaterial = new THREE.MeshStandardMaterial({ roughness: 0.77, metalness: 0.23 });
export const metalMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.64 });
export const windowMaterial = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.5 });
export const glowMaterial = new THREE.MeshStandardMaterial({ roughness: 0.65, emissive: 0xffffff, emissiveIntensity: 0.6 });

const plasterPixels = new Uint8Array(128 * 128 * 4);
for (let row = 0; row < 128; row++) for (let column = 0; column < 128; column++) {
  const grain = (row * 113 + column * 197) % 21;
  const streak = column % 23 < 3 ? Math.max(0, 22 - row % 64 / 3) : 0;
  const value = Math.round(229 + grain - streak), offset = (row * 128 + column) * 4;
  plasterPixels[offset] = value; plasterPixels[offset + 1] = value; plasterPixels[offset + 2] = value - 3; plasterPixels[offset + 3] = 255;
}
const plasterTexture = new THREE.DataTexture(plasterPixels, 128, 128, THREE.RGBAFormat);
plasterTexture.colorSpace = THREE.SRGBColorSpace; plasterTexture.magFilter = THREE.LinearFilter;
plasterTexture.minFilter = THREE.LinearMipmapLinearFilter; plasterTexture.generateMipmaps = true; plasterTexture.anisotropy = 4;
plasterTexture.wrapS = plasterTexture.wrapT = THREE.RepeatWrapping; plasterTexture.repeat.set(3, 3); plasterTexture.needsUpdate = true;
export const plasterMaterial = new THREE.MeshStandardMaterial({ map: plasterTexture, bumpMap: plasterTexture, bumpScale: .04, roughness: .94 });

function createFacadeMaterial(): THREE.MeshStandardMaterial {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let row = 0; row < 64; row++) for (let column = 0; column < 64; column++) {
    const frame = column < 3 || column > 60 || row < 3 || row > 58 || (column > 29 && column < 34);
    const reflection = Math.round(12 * (1 - row / 64) + (column < 30 ? 4 : 0));
    const offset = (row * 64 + column) * 4;
    pixels[offset] = frame ? 190 : 61 + reflection;
    pixels[offset + 1] = frame ? 188 : 78 + reflection;
    pixels[offset + 2] = frame ? 175 : 74 + reflection;
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, 64, 64, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: .68, metalness: .16 });
}
export const facadeMaterial = createFacadeMaterial();

export interface Pose {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

/** Handle to one instance of a finished batch (v1.9). `mesh`/`index` are filled by `finish()`. */
export interface BatchRef {
  mesh?: THREE.InstancedMesh;
  index: number;
  readonly matrix: THREE.Matrix4;
  readonly color: THREE.Color;
}

const poseTransform = new THREE.Object3D();
function poseMatrix(pose: Pose, target = new THREE.Matrix4()): THREE.Matrix4 {
  poseTransform.position.set(...pose.position);
  poseTransform.scale.set(...pose.scale);
  poseTransform.rotation.set(...(pose.rotation ?? [0, 0, 0]));
  poseTransform.updateMatrix();
  return target.copy(poseTransform.matrix);
}

/** Overwrite one finished instance's transform (GPU upload happens on the next render). */
export function setInstancePose(ref: BatchRef, matrix: THREE.Matrix4): void {
  ref.matrix.copy(matrix);
  if (ref.mesh) { ref.mesh.setMatrixAt(ref.index, matrix); ref.mesh.instanceMatrix.needsUpdate = true; }
}
export function setInstanceColor(ref: BatchRef, color: THREE.ColorRepresentation): void {
  ref.color.set(color);
  if (ref.mesh) { ref.mesh.setColorAt(ref.index, ref.color); if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true; }
}

export class GeometryBatch {
  private readonly entries = new Map<THREE.BufferGeometry, BatchRef[]>();
  /** Optional parent transform applied to every pose added while it is set (used to place whole vehicles). */
  base: THREE.Matrix4 | null = null;
  constructor(private readonly material: THREE.Material = solidMaterial) {}

  add(geometry: THREE.BufferGeometry, pose: Pose, color: THREE.ColorRepresentation): BatchRef {
    const matrix = poseMatrix(pose);
    if (this.base) matrix.premultiply(this.base);
    const ref: BatchRef = { index: -1, matrix, color: new THREE.Color(color) };
    const instances = this.entries.get(geometry) ?? [];
    instances.push(ref);
    this.entries.set(geometry, instances);
    return ref;
  }

  box(pose: Pose, color: THREE.ColorRepresentation): BatchRef { return this.add(unitBox, pose, color); }
  cylinder(pose: Pose, color: THREE.ColorRepresentation): BatchRef { return this.add(unitCylinder, pose, color); }
  sphere(pose: Pose, color: THREE.ColorRepresentation): BatchRef { return this.add(unitSphere, pose, color); }

  finish(group: THREE.Group, castShadow = true, cellSize = 0): void {
    for (const [geometry, instances] of this.entries) {
      const cells = new Map<string, BatchRef[]>();
      for (const instance of instances) {
        const e = instance.matrix.elements;
        const key = cellSize ? `${Math.floor((e[12]! + cellSize / 2) / cellSize)},${Math.floor((e[14]! + cellSize / 2) / cellSize)}` : 'all';
        const cell = cells.get(key) ?? []; cell.push(instance); cells.set(key, cell);
      }
      for (const cell of cells.values()) {
        const mesh = new THREE.InstancedMesh(geometry, this.material, cell.length);
        cell.forEach((ref, index) => {
          ref.mesh = mesh; ref.index = index;
          mesh.setMatrixAt(index, ref.matrix);
          mesh.setColorAt(index, ref.color);
        });
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
  }
}

/** Day/dusk emissive registry: `setGlowMode(true)` raises signs and lamps to neon strength (day values unchanged). */
const glowRegistry: { material: THREE.MeshStandardMaterial; day: number; dusk: number }[] = [];
export function registerGlow(material: THREE.MeshStandardMaterial, day: number, dusk: number): void {
  glowRegistry.push({ material, day, dusk }); material.emissiveIntensity = glowDusk ? dusk : day;
}
let glowDusk = false;
export function setGlowMode(dusk: boolean): void {
  glowDusk = dusk;
  for (const entry of glowRegistry) entry.material.emissiveIntensity = dusk ? entry.dusk : entry.day;
  if (asphalt) { asphalt.emissive.setHex(dusk ? ROAD_DUSK_GLOW : 0x000000); asphalt.emissiveIntensity = dusk ? ROAD_DUSK_INTENSITY : 0; }
}
export const isDuskGlow = (): boolean => glowDusk;
registerGlow(glowMaterial, .6, .95);
let asphalt: THREE.MeshStandardMaterial | null = null;
const ROAD_DUSK_GLOW = 0xff9a55, ROAD_DUSK_INTENSITY = 2.3;

export function createAsphaltMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#565652';
    context.fillRect(0, 0, 256, 256);
    let seed = 987654;
    for (let index = 0; index < 15000; index++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = seed % 256;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      context.fillStyle = index % 3 === 0 ? '#62615a' : '#484b49';
      context.fillRect(x, seed % 256, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(100, 100);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Wet-road look: at dusk the asphalt picks up warm neon spill (texture-modulated, so grain survives); day is untouched.
  asphalt = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, roughness: 0.75, metalness: 0.02 });
  if (glowDusk) { asphalt.emissive.setHex(ROAD_DUSK_GLOW); asphalt.emissiveIntensity = ROAD_DUSK_INTENSITY; }
  return asphalt;
}

export interface SignStyle {
  readonly text: string;
  readonly subtitle: string;
  readonly background: string;
  readonly foreground: string;
  readonly vertical?: boolean;
  readonly neon?: boolean;
}

/** Paint one sign into a rectangle of a 2D canvas. `neon` draws tube-outlined glyphs with an outer halo. */
export function paintSign(context: CanvasRenderingContext2D, style: SignStyle, x: number, y: number, width: number, height: number): void {
  context.save();
  context.beginPath(); context.rect(x, y, width, height); context.clip();
  context.fillStyle = style.background;
  context.fillRect(x, y, width, height);
  context.strokeStyle = style.foreground;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (style.neon) {
    context.lineJoin = 'round';
    context.shadowColor = style.foreground; context.shadowBlur = 12; context.lineWidth = 5;
    context.strokeRect(x + 9, y + 9, width - 18, height - 18);
    const chars = [...style.text], pitch = (height - 40) / Math.max(chars.length, 3), size = Math.min(width - 30, pitch * .92);
    context.font = `bold ${Math.round(size)}px "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif`;
    chars.forEach((character, index) => {
      const cy = y + 20 + pitch * (index + .5);
      context.shadowBlur = 14; context.lineWidth = 4; context.strokeStyle = style.foreground;
      context.strokeText(character, x + width / 2, cy);
      context.shadowBlur = 0; context.lineWidth = 1.5; context.strokeStyle = '#ffffff';
      context.strokeText(character, x + width / 2, cy);
    });
    context.restore();
    return;
  }
  context.lineWidth = 3;
  context.strokeRect(x + 7, y + 7, width - 14, height - 14);
  context.fillStyle = style.foreground;
  context.shadowColor = style.foreground;
  context.shadowBlur = 4;
  if (style.vertical) {
    context.font = 'bold 72px "Microsoft JhengHei", sans-serif';
    [...style.text].forEach((character, index) => context.fillText(character, x + 64, y + 66 + index * 94));
  } else {
    context.font = 'bold 56px "Microsoft JhengHei", sans-serif';
    context.fillText(style.text, x + 256, y + 48, 480);
    context.font = '19px Arial, sans-serif';
    context.fillText(style.subtitle, x + 256, y + 97, 470);
  }
  context.restore();
}

export function createSignMaterial(style: SignStyle): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = style.vertical ? 128 : 512;
  canvas.height = style.vertical ? 512 : 128;
  const context = canvas.getContext('2d');
  if (context) paintSign(context, style, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.38, roughness: 0.8, side: THREE.DoubleSide });
  registerGlow(material, 0.38, 1.1);
  return material;
}
