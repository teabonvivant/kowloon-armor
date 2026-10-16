import * as THREE from 'three';
import type { BreakKind, Destructible } from '../game-events-v19';
import { MISSIONS } from '../data/missions';
import { TOUR_STOPS } from '../field';
import type { CityBlock } from './geo-buildings';
import { flicker, onWorldLighting, updateFlicker } from './lighting';
import { GeometryBatch, glowMaterial, metalMaterial, paintSign, registerGlow, setInstanceColor, setInstancePose, solidMaterial, windowMaterial } from './materials';
import type { BatchRef, SignStyle } from './materials';
import type { Obstacle } from './world';

/* ───────── sign atlas: every shop / projecting / street / light-box sign is one InstancedMesh, one draw call ───────── */

const ATLAS_W = 2048, ATLAS_H = 1024, GUTTER = 0; // slots carry their own border; 13 horizontal + 12 vertical + 2 ad slots fill the sheet exactly
interface SlotDef { readonly style: SignStyle; readonly w: number; readonly h: number }
interface Placed extends SlotDef { x: number; y: number }

export interface SignLayer {
  readonly mesh: THREE.InstancedMesh | null;
  readonly material: THREE.MeshStandardMaterial;
  readonly count: number;
  /** Per-instance emissive multiplier (1 = lit, 0 = extinguished). */
  power(id: number): number;
  setPower(id: number, value: number): void;
  setTint(id: number, r: number, g: number, b: number): void;
  setMatrix(id: number, matrix: THREE.Matrix4): void;
  slotOf(id: number): string;
}

export class SignAtlas {
  private readonly defs = new Map<string, SlotDef>();
  private readonly quads: { slot: string; matrix: THREE.Matrix4; group: number }[] = [];
  define(key: string, style: SignStyle, w: number, h: number): void { if (!this.defs.has(key)) this.defs.set(key, { style, w, h }); }
  has(key: string): boolean { return this.defs.has(key); }
  get count(): number { return this.quads.length; }
  /** Adds one quad; returns its instance id (stable). `group` 0..2 selects a flicker channel. */
  add(slot: string, matrix: THREE.Matrix4, group = 0): number {
    if (!this.defs.has(slot)) throw new Error(`Unknown sign slot ${slot}`);
    this.quads.push({ slot, matrix: matrix.clone(), group: group % 3 }); return this.quads.length - 1;
  }

  build(parent: THREE.Group): SignLayer {
    const placed = new Map<string, Placed>();
    const order = [...this.defs.entries()].sort((a, b) => b[1].h - a[1].h);
    let cursorX = 0, cursorY = 0, rowHeight = 0;
    for (const [key, def] of order) {
      if (cursorX + def.w > ATLAS_W) { cursorX = 0; cursorY += rowHeight + GUTTER; rowHeight = 0; }
      if (cursorY + def.h > ATLAS_H) throw new Error('Sign atlas overflow');
      placed.set(key, { ...def, x: cursorX, y: cursorY }); cursorX += def.w + GUTTER; rowHeight = Math.max(rowHeight, def.h);
    }
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W; canvas.height = ATLAS_H;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#101214'; context.fillRect(0, 0, ATLAS_W, ATLAS_H);
      for (const slot of placed.values()) paintSign(context, slot.style, slot.x, slot.y, slot.w, slot.h);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveIntensity: .38, roughness: .8 });
    registerGlow(material, .38, 1.1);
    material.onBeforeCompile = shader => {
      shader.uniforms['uFlicker'] = { value: flicker };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;\nattribute vec2 signInfo;\nvarying vec2 vSignInfo;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uvRect.xy + uv * uvRect.zw;\n#endif\nvSignInfo = signInfo;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFlicker;\nvarying vec2 vSignInfo;')
        .replace('#include <emissivemap_fragment>',
          'float hkFlick = vSignInfo.y < .5 ? uFlicker.x : (vSignInfo.y < 1.5 ? uFlicker.y : uFlicker.z);\n' +
          'totalEmissiveRadiance *= diffuseColor.rgb * vSignInfo.x * hkFlick;');
    };
    const count = this.quads.length;
    const power = new Float32Array(count).fill(1);
    const slots = this.quads.map(quad => quad.slot);
    if (!count) {
      return { mesh: null, material, count, power: () => 1, setPower() {}, setTint() {}, setMatrix() {}, slotOf: () => '' };
    }
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.BufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('normal', base.getAttribute('normal'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    const uvRect = new Float32Array(count * 4), info = new Float32Array(count * 2);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const white = new THREE.Color(1, 1, 1);
    this.quads.forEach((quad, index) => {
      const slot = placed.get(quad.slot)!;
      uvRect.set([(slot.x + 1) / ATLAS_W, 1 - (slot.y + slot.h - 1) / ATLAS_H, (slot.w - 2) / ATLAS_W, (slot.h - 2) / ATLAS_H], index * 4);
      info[index * 2] = 1; info[index * 2 + 1] = quad.group;
      mesh.setMatrixAt(index, quad.matrix); mesh.setColorAt(index, white);
    });
    const uvAttribute = new THREE.InstancedBufferAttribute(uvRect, 4);
    const infoAttribute = new THREE.InstancedBufferAttribute(info, 2);
    geometry.setAttribute('uvRect', uvAttribute); geometry.setAttribute('signInfo', infoAttribute);
    mesh.name = 'hk-sign-atlas'; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false; mesh.computeBoundingSphere();
    mesh.onBeforeRender = () => { updateFlicker(performance.now() / 1000); };
    parent.add(mesh);
    const tint = new THREE.Color();
    return {
      mesh, material, count,
      power: id => info[id * 2]!,
      setPower(id, value) { info[id * 2] = value; power[id] = value; infoAttribute.needsUpdate = true; },
      setTint(id, r, g, b) { tint.setRGB(r, g, b); mesh.setColorAt(id, tint); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
      setMatrix(id, matrix) { mesh.setMatrixAt(id, matrix); mesh.instanceMatrix.needsUpdate = true; },
      slotOf: id => slots[id] ?? '',
    };
  }
}

/* ───────── fictional signs (never real chains; traditional characters only) ───────── */

const neon = (text: string, foreground: string, background: string): SignStyle => ({ text, subtitle: '', foreground, background, vertical: true, neon: true });
export const NEON_SIGNS: readonly SignStyle[] = [
  neon('龍華旅館', '#ff5fa8', '#1a0c16'), neon('福祿酒樓', '#ffb347', '#1c1208'), neon('德昌當押', '#ff4d4d', '#190909'),
  neon('回春藥行', '#59f2a0', '#08170f'), neon('寶光金舖', '#ffd84a', '#1b1604'), neon('雅聚茶樓', '#7fe3ff', '#07141a'),
  neon('順達找換', '#6cf0c8', '#071916'), neon('勝記粥麵', '#ff8a3d', '#1c0e06'), neon('泰安跌打', '#c58bff', '#120a1c'),
  neon('興隆海味', '#ff6f91', '#1c0a10'), neon('金鳳麵家', '#ffe066', '#1b1507'), neon('新月旅舍', '#8fb8ff', '#0a1020'),
];
export const LIGHTBOX_ADS: readonly SignStyle[] = [
  { text: '涼茶', subtitle: '', foreground: '#fff3c4', background: '#7c2a1f', neon: true },
  { text: '糖水', subtitle: '', foreground: '#d6fff0', background: '#1d5a4a', neon: true },
];
/** Distinct substrings that must never appear on a sign (real chains / department stores / banks). */
export const REAL_BRAND_BLACKLIST: readonly string[] = ['大家樂', '大快活', '美心', '麥當勞', '肯德基', '星巴克', '屈臣氏', '萬寧', '百佳', '惠康',
  '周大福', '六福', '周生生', '謝瑞麟', '永安', '先施', '匯豐', '恒生', '中銀', '渣打', '太興', '翠華', '吉野家', '許留山', '榮華', '安樂園',
  '7-Eleven', '圓方', '海港城', '莎莎', '豐澤', '百老匯', '鴻福堂', '同仁堂', '大班', '東海'];

export const SIGN_TIERS = [6.5, 9.5, 13] as const;

/* ───────── breakables (C13) ───────── */

export interface HkDestructible extends Destructible {
  /** Current emissive multiplier of the instance(s); 0 once extinguished. */
  readonly emissive: number;
  readonly state: 'idle' | 'animating' | 'done';
  /** Seconds a falling sign needs to reach the ground (0.8–1.4); 0 for non-falling kinds. */
  readonly fallDuration: number;
  /** Seconds since `break()`; the sign has landed when this reaches `fallDuration`. */
  readonly age: number;
  readonly landed: boolean;
  reset(): void;
}
export const ACTIVE_CAP = 24;

interface Anim { owner: BreakableImpl; step(dt: number): boolean }
const tmp = new THREE.Object3D();
const frontOffset = new THREE.Matrix4().makeTranslation(0, 0, .03);
const backOffset = new THREE.Matrix4().makeTranslation(0, 0, -.03).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
export function signPairMatrices(cx: number, cy: number, cz: number, yaw: number, width: number, height: number,
  tilt: number, roll: number, front: THREE.Matrix4, back: THREE.Matrix4): void {
  tmp.position.set(cx, cy, cz); tmp.rotation.set(tilt, yaw + Math.PI / 2, roll, 'YXZ'); tmp.scale.set(width, height, 1); tmp.updateMatrix();
  front.copy(tmp.matrix).multiply(frontOffset); back.copy(tmp.matrix).multiply(backOffset);
}

class BreakManager {
  readonly active = new Set<Anim>();
  readonly all: BreakableImpl[] = [];
  start(anim: Anim): boolean { if (this.active.size >= ACTIVE_CAP) return false; this.active.add(anim); return true; }
  update(dt: number): void {
    if (!this.active.size || !(dt > 0)) return;
    for (const anim of [...this.active]) if (anim.step(dt)) { this.active.delete(anim); anim.owner.finishAnimation(); }
  }
  reset(): void { this.active.clear(); for (const item of this.all) item.reset(); }
}

abstract class BreakableImpl implements HkDestructible {
  broken = false; state: 'idle' | 'animating' | 'done' = 'idle'; fallDuration = 0; age = 0; landed = false;
  constructor(readonly id: number, readonly kind: BreakKind, readonly x: number, readonly y: number, readonly z: number, protected readonly manager: BreakManager) {}
  abstract get emissive(): number;
  abstract reset(): void;
  protected abstract begin(power: number): Anim;
  break(power: number): boolean {
    if (this.broken) return false;
    const anim = this.begin(power);
    if (!this.manager.start(anim)) return false;
    this.broken = true; this.state = 'animating'; this.age = 0; return true;
  }
  finishAnimation(): void { this.state = 'done'; }
}

/** A hung sign (front + back quad of the atlas). `sign` falls and thins out; `neon` flashes white-blue then dies in place. */
class SignBreakable extends BreakableImpl {
  private readonly front = new THREE.Matrix4(); private readonly back = new THREE.Matrix4();
  private readonly spin: number;
  constructor(id: number, kind: BreakKind, x: number, y: number, z: number, manager: BreakManager,
    private readonly layer: () => SignLayer, private readonly ids: readonly [number, number],
    private readonly yaw: number, private readonly width: number, private readonly length: number) {
    super(id, kind, x, y, z, manager);
    this.spin = id % 2 ? 1 : -1;
    if (kind === 'sign') this.fallDuration = .8 + .6 * Math.min(1, Math.max(0, (y - 6.5) / 6.5));
  }
  get emissive(): number { return this.layer().power(this.ids[0]); }
  private pose(drop: number, flatten: number, roll: number, thin: number): void {
    const layer = this.layer(), nx = Math.sin(this.yaw), nz = Math.cos(this.yaw);
    const out = 1.7 * drop * drop;
    signPairMatrices(this.x + nx * out, this.y + (.07 - this.y) * drop * drop, this.z + nz * out, this.yaw, this.width, this.length * thin,
      flatten * Math.PI / 2, roll * this.spin, this.front, this.back);
    layer.setMatrix(this.ids[0], this.front); layer.setMatrix(this.ids[1], this.back);
  }
  private power(value: number, tint = 1): void {
    const layer = this.layer();
    for (const id of this.ids) { layer.setPower(id, value); layer.setTint(id, tint, tint, tint); }
  }
  private tint(r: number, g: number, b: number, value: number): void {
    const layer = this.layer();
    for (const id of this.ids) { layer.setPower(id, value); layer.setTint(id, r, g, b); }
  }
  protected begin(): Anim {
    let t = 0;
    if (this.kind === 'sign') {
      const total = this.fallDuration;
      return { owner: this, step: dt => {
        t += dt; this.age = t;
        const s = Math.min(1, t / total);
        if (t < total) { this.pose(s, Math.min(1, s * 1.1), s * s * .9, 1); return false; }
        this.landed = true;
        const u = Math.min(1, (t - total) / .15);
        this.pose(1, 1, .9, 1 - .65 * u);
        const flash = t - total < .12;
        this.tint(.28, .26, .24, flash ? 1.8 : 0);
        return t - total >= .15;
      } };
    }
    return { owner: this, step: dt => {
      t += dt; this.age = t;
      if (t < .08) this.tint(.75, .9, 1, 4);
      else if (t < .16) this.tint(.5, .6, .8, .3);
      else if (t < .26) this.tint(.7, .85, 1, 3);
      else { this.tint(.3, .3, .34, 0); this.landed = true; return true; }
      return false;
    } };
  }
  reset(): void {
    this.broken = false; this.state = 'idle'; this.age = 0; this.landed = false;
    this.pose(0, 0, 0, 1); this.power(1);
  }
}

/** Dai pai dong canvas roof: flips up and settles; purely visual (instance of a shared batch). */
class StallBreakable extends BreakableImpl {
  private readonly lift = new THREE.Matrix4();
  constructor(id: number, x: number, y: number, z: number, manager: BreakManager, private readonly roof: BatchRef, private readonly yaw: number) {
    super(id, 'stall', x, y, z, manager);
    this.home = roof.matrix.clone();
  }
  private readonly home: THREE.Matrix4;
  get emissive(): number { return 0; }
  protected begin(): Anim {
    let t = 0;
    return { owner: this, step: dt => {
      t += dt; this.age = t;
      const u = Math.min(1, t / .45), e = 1 - (1 - u) * (1 - u);
      const centre = new THREE.Vector3().setFromMatrixPosition(this.home);
      this.lift.makeTranslation(centre.x, centre.y + .5 * e, centre.z)
        .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), -.55 * e))
        .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
      setInstancePose(this.roof, this.lift.clone().multiply(this.home));
      if (u >= 1) { setInstanceColor(this.roof, 0x4b4a40); this.landed = true; }
      return u >= 1;
    } };
  }
  reset(): void {
    this.broken = false; this.state = 'idle'; this.age = 0; this.landed = false;
    setInstancePose(this.roof, this.home);
  }
}

/* ───────── street context shared by city-details / street-props / geo-vehicles / world ───────── */

export interface SignInfo { readonly id: number; /** atlas instance index of the front quad (back = quad + 1) */ readonly quad: number; readonly slot: string; readonly text: string; readonly tier: number; readonly x: number; readonly y: number; readonly z: number; readonly length: number; readonly width: number }
export interface HkAnchorInfo { readonly kind: string; readonly index: number; readonly x: number; readonly z: number; readonly yaw: number }
const canvasMaterial = new THREE.MeshStandardMaterial({ roughness: .95, metalness: 0 });
const ROAD_CENTRES = [-168, -84, 0, 84, 168] as const;

export class HkContext {
  readonly atlas = new SignAtlas();
  readonly solid = new GeometryBatch(solidMaterial);
  readonly metal = new GeometryBatch(metalMaterial);
  readonly glass = new GeometryBatch(windowMaterial);
  readonly canvas = new GeometryBatch(canvasMaterial);
  readonly glow = new GeometryBatch(glowMaterial);
  readonly anchors = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly destructibles: HkDestructible[] = [];
  readonly signs: SignInfo[] = [];
  readonly anchorInfo: HkAnchorInfo[] = [];
  readonly manager = new BreakManager();
  layer: SignLayer | null = null;
  private idCounter = 0;
  private readonly counters = new Map<string, number>();
  private existing: readonly Obstacle[] = [];
  private readonly keepClear: (readonly [number, number])[] = [];
  readonly stripeSources: { x: number; z: number; yaw: number; width: number; color: string }[] = [];

  /** `extras=false` builds only the atlas signage (no new props / obstacles) - the v1.8 collision footprint is untouched. */
  constructor(readonly extras = true) {
    this.anchors.name = 'hk-street';
    for (const mission of MISSIONS) {
      this.keepClear.push([mission.spawn[0], mission.spawn[1]], ...mission.targets);
      if ('center' in mission.objective) this.keepClear.push([mission.objective.center[0], mission.objective.center[1]]);
    }
    for (const stop of TOUR_STOPS) this.keepClear.push([stop.x, stop.z]);
    this.keepClear.push([0, 100], [0, 20], [15, 115]);
  }

  nextId(): number { return this.idCounter++; }
  setExisting(obstacles: readonly Obstacle[]): void { this.existing = obstacles; }

  /** Empty, testable scene node (`hk-<kind>-<n>`); visuals live in the shared batches. Returns the running index. */
  anchor(kind: string, x: number, z: number, yaw = 0, y = 0, data: Record<string, unknown> = {}): THREE.Object3D {
    const index = this.counters.get(kind) ?? 0; this.counters.set(kind, index + 1);
    const node = new THREE.Object3D(); node.name = `hk-${kind}-${index}`;
    node.position.set(x, y, z); node.rotation.y = yaw; node.userData = { kind, index, ...data };
    this.anchors.add(node); this.anchorInfo.push({ kind, index, x, z, yaw });
    return node;
  }
  count(kind: string): number { return this.counters.get(kind) ?? 0; }

  /** True when a footprint is clear of every existing/new obstacle, mission point, tour stop and junction. */
  isFree(x: number, z: number, halfX: number, halfZ: number, pad = 1.2): boolean {
    for (const box of [...this.existing, ...this.obstacles]) {
      if (Math.abs(x - box.x) < halfX + box.halfX + pad && Math.abs(z - box.z) < halfZ + box.halfZ + pad) return false;
    }
    for (const [px, pz] of this.keepClear) if (Math.abs(x - px) < halfX + 9 && Math.abs(z - pz) < halfZ + 9) return false;
    for (const rx of ROAD_CENTRES) for (const rz of ROAD_CENTRES) if (Math.abs(x - rx) < halfX + 16 && Math.abs(z - rz) < halfZ + 16) return false;
    return true;
  }

  addSignPair(kind: BreakKind, slot: string, text: string, cx: number, cy: number, cz: number, yaw: number,
    width: number, length: number, group: number, tier: number): HkDestructible {
    const front = new THREE.Matrix4(), back = new THREE.Matrix4();
    signPairMatrices(cx, cy, cz, yaw, width, length, 0, 0, front, back);
    const a = this.atlas.add(slot, front, group), b = this.atlas.add(slot, back, group);
    const id = this.nextId();
    const item = new SignBreakable(id, kind, cx, cy, cz, this.manager, () => this.layer!, [a, b], yaw, width, length);
    this.manager.all.push(item); this.destructibles.push(item);
    this.signs.push({ id, quad: a, slot, text, tier, x: cx, y: cy, z: cz, length, width });
    return item;
  }

  addStallBreakable(x: number, y: number, z: number, roof: BatchRef, yaw: number): HkDestructible {
    const item = new StallBreakable(this.nextId(), x, y, z, this.manager, roof, yaw);
    this.manager.all.push(item); this.destructibles.push(item); return item;
  }

  /** Builds every batch + the atlas into `group`; call once, after all additions. */
  finish(group: THREE.Group): void {
    this.layer = this.atlas.build(group);
    // One city-wide InstancedMesh per geometry and batch: sparse small props cost one call each, not one per 168 m cell.
    this.solid.finish(group, true); this.metal.finish(group, false);
    this.glass.finish(group, false); this.canvas.finish(group, false); this.glow.finish(group, false);
    group.add(this.anchors);
  }
  update(dt: number): void { this.manager.update(dt); }
  get activeCount(): number { return this.manager.active.size; }
}

/* ───────── projecting neon signs (C08) ───────── */

const hash = (n: number): number => { let h = Math.imul(n + 1, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };

export function facePlacements(block: CityBlock): { x: number; z: number; yaw: number; width: number }[] {
  return [
    { x: block.x, z: block.z - block.depth / 2 - .04, yaw: Math.PI, width: block.width },
    { x: block.x, z: block.z + block.depth / 2 + .04, yaw: 0, width: block.width },
    { x: block.x - block.width / 2 - .04, z: block.z, yaw: -Math.PI / 2, width: block.depth },
    { x: block.x + block.width / 2 + .04, z: block.z, yaw: Math.PI / 2, width: block.depth },
  ];
}

/** 3–5 signs per block face on three height tiers (6.5 / 9.5 / 13 m), double-sided, 1.4–2.2 m wide, 5–9 m long. */
export function addProjectingSigns(ctx: HkContext, blocks: readonly CityBlock[]): void {
  NEON_SIGNS.forEach((style, index) => ctx.atlas.define(`neon-${index}`, style, 128, 512));
  for (const block of blocks) {
    facePlacements(block).forEach((face, f) => {
      const count = 3 + (block.index + f) % 3;
      const span = Math.max(8, face.width - 14), step = span / (count - 1);
      const nx = Math.sin(face.yaw), nz = Math.cos(face.yaw), tx = Math.cos(face.yaw), tz = -Math.sin(face.yaw);
      for (let k = 0; k < count; k++) {
        const tierIndex = (k + f + block.index) % 3, tier = SIGN_TIERS[tierIndex]!;
        const lengthSteps = tierIndex === 0 ? 3 : 5;
        const length = (tierIndex === 0 ? 5 : 5.6) + Math.floor(hash(block.index * 31 + f * 7 + k) * lengthSteps) * .8;
        const width = Math.min(2.2, Math.max(1.4, length / 4));
        const along = -span / 2 + step * k + (hash(block.index * 13 + f * 5 + k * 3) - .5) * 1.4;
        const style = (block.index * 7 + f * 5 + k * 3) % NEON_SIGNS.length;
        const cx = face.x + tx * along + nx * (.05 + width / 2), cz = face.z + tz * along + nz * (.05 + width / 2);
        const kind: BreakKind = (block.index + f + k) % 2 === 0 ? 'sign' : 'neon';
        const text = NEON_SIGNS[style]!.text;
        ctx.addSignPair(kind, `neon-${style}`, text, cx, tier, cz, face.yaw, width, length, (block.index + f + k) % 3, tierIndex);
        // wall arm from the (possibly recessed) tower face to the sign's inner edge
        ctx.metal.box({ position: [face.x + tx * along + nx * (-1.2), tier + length * .3, face.z + tz * along + nz * (-1.2)], scale: [.12, .12, 2.5], rotation: [0, face.yaw, 0] }, 0x3a3f3a);
        if (tierIndex === 2 && length >= 6.4 && hash(block.index * 5 + f * 11 + k) < .5) {
          ctx.stripeSources.push({ x: face.x + tx * along + nx * (2.4 + 3.6), z: face.z + tz * along + nz * (2.4 + 3.6), yaw: face.yaw, width: width * .85, color: NEON_SIGNS[style]!.foreground });
        }
      }
    });
  }
}

/* ───────── wet street: pseudo-reflection bars + puddles (C15) ───────── */

export function addWetStreet(ctx: HkContext, group: THREE.Group): { stripes: number; puddles: number } {
  const sources = ctx.stripeSources.slice(0, 48);
  if (sources.length) {
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.InstancedMesh(geometry, material, sources.length);
    const object = new THREE.Object3D();
    sources.forEach((source, index) => {
      object.position.set(source.x, .034, source.z); object.rotation.set(0, source.yaw, 0); object.scale.set(source.width, 1, 7.2); object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix); mesh.setColorAt(index, new THREE.Color(source.color));
    });
    mesh.name = 'hk-wet-reflections'; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.computeBoundingSphere(); mesh.renderOrder = 2;
    onWorldLighting(dusk => { mesh.visible = dusk; });
    group.add(mesh);
  }
  const spots: [number, number, number, number, number][] = [];
  for (let line = 0; line < 10; line++) {
    const road = ROAD_CENTRES[line % 5]!, alongX = line >= 5;
    for (let n = 0; n < 5; n++) {
      const seed = line * 17 + n * 5;
      let along = -200 + hash(seed) * 400;
      if (ROAD_CENTRES.some(c => Math.abs(along - c) < 17)) along += 22;
      const lateral = (hash(seed + 1) < .5 ? -1 : 1) * (3.6 + hash(seed + 2) * 3.4);
      const rx = 1.1 + hash(seed + 3) * 1.5, rz = .7 + hash(seed + 4) * .9;
      spots.push(alongX ? [along, road + lateral, rz, rx, 0] : [road + lateral, along, rx, rz, 0]);
    }
  }
  const geometry = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x161c24, roughness: .06, metalness: .1, transparent: true, opacity: .6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const object = new THREE.Object3D();
  spots.forEach(([x, z, sx, sz], index) => {
    object.position.set(x, .03, z); object.scale.set(sx, 1, sz); object.rotation.set(0, 0, 0); object.updateMatrix(); mesh.setMatrixAt(index, object.matrix);
  });
  mesh.name = 'hk-puddles'; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.computeBoundingSphere(); mesh.renderOrder = 1;
  group.add(mesh);
  return { stripes: sources.length, puddles: spots.length };
}

/* ───────── street furniture (C14): flyovers, dai pai dong, laundry poles ───────── */

const FLYOVERS = [{ x: -84, z: -42, alongX: true }, { x: 84, z: 42, alongX: true }, { x: -42, z: -84, alongX: false }, { x: 42, z: 84, alongX: false }] as const;
const STALL_SPOTS = [
  { block: [-126, -42], face: 1, t: 12 }, { block: [-126, 42], face: 0, t: 10 }, { block: [42, -42], face: 1, t: 16 },
  { block: [-42, -126], face: 3, t: 14 }, { block: [126, -42], face: 1, t: 12 }, { block: [-126, -210], face: 3, t: 4 },
] as const;
const CANVAS_COLOURS = [0x2f6b4f, 0x2f5f8a, 0xa8402f, 0x7a8f3a] as const;

function swapped(yaw: number): boolean { return Math.abs(Math.sin(yaw)) > .5; }

export function addStreetFurniture(ctx: HkContext, blocks: readonly CityBlock[]): void {
  const base = new THREE.Matrix4(), rotate = new THREE.Matrix4();
  const place = (x: number, y: number, z: number, yaw: number): THREE.Matrix4 => base.makeTranslation(x, y, z).multiply(rotate.makeRotationY(yaw));
  // flyovers
  let flyovers = 0;
  for (const spec of FLYOVERS) {
    if (flyovers >= 2) break;
    const yaw = spec.alongX ? 0 : Math.PI / 2;
    const tower = (side: number): [number, number] => spec.alongX ? [spec.x + side * 11.8, spec.z] : [spec.x, spec.z + side * 11.8];
    const half = spec.alongX ? [1.1, 1.5] as const : [1.5, 1.1] as const;
    if ([-1, 1].some(side => !ctx.isFree(tower(side)[0], tower(side)[1], half[0], half[1], .05))) continue;
    ctx.solid.base = place(spec.x, 0, spec.z, yaw).clone();
    ctx.metal.base = ctx.solid.base; ctx.glass.base = ctx.solid.base; ctx.glow.base = ctx.solid.base;
    ctx.solid.box({ position: [0, 6.3, 0], scale: [29, .6, 3.2] }, 0x8f938a);
    for (const side of [-1, 1]) {
      ctx.metal.box({ position: [0, 7.05, side * 1.55], scale: [29, .08, .08] }, 0x6d776c);
      ctx.metal.box({ position: [0, 6.7, side * 1.55], scale: [29, .08, .08] }, 0x6d776c);
      ctx.glass.box({ position: [0, 6.95, side * 1.57], scale: [28.4, .55, .04] }, 0x3a4f4a);
      ctx.solid.box({ position: [side * 11.8, 3.3, 0], scale: [2.2, 6.6, 3] }, 0x7d8479);
      ctx.solid.box({ position: [side * 11.8, 6.75, 0], scale: [2.4, .3, 3.3] }, 0xa09b8a);
      ctx.glow.box({ position: [side * 10.65, 5.1, 0], scale: [.1, .7, 1.2] }, 0xffd9a0);
    }
    ctx.glass.base = ctx.solid.base = ctx.metal.base = ctx.glow.base = null;
    for (const side of [-1, 1]) { const [tx, tz] = tower(side); ctx.obstacles.push({ x: tx, z: tz, halfX: half[0], halfZ: half[1], surface: 'building' }); }
    ctx.anchor('flyover', spec.x, spec.z, yaw, 6.3, { deckBottom: 6, span: 29 });
    flyovers++;
  }
  // dai pai dong
  let stalls = 0;
  for (const spot of STALL_SPOTS) {
    const block = blocks.find(item => item.x === spot.block[0] && item.z === spot.block[1]);
    if (!block) continue;
    const face = facePlacements(block)[spot.face]!;
    const nx = Math.sin(face.yaw), nz = Math.cos(face.yaw), tx = Math.cos(face.yaw), tz = -Math.sin(face.yaw);
    const x = face.x + tx * spot.t + nx * 1.3, z = face.z + tz * spot.t + nz * 1.3;
    const halfX = swapped(face.yaw) ? 1.05 : 1.9, halfZ = swapped(face.yaw) ? 1.9 : 1.05;
    if (!ctx.isFree(x, z, halfX, halfZ, .05)) continue;
    const mats = place(x, 0, z, face.yaw).clone();
    ctx.solid.base = ctx.metal.base = ctx.canvas.base = ctx.glow.base = mats;
    const colour = CANVAS_COLOURS[stalls % CANVAS_COLOURS.length]!;
    ctx.solid.box({ position: [0, .45, -.62], scale: [3, .9, .6] }, 0x2f6f4d);
    ctx.metal.box({ position: [0, .93, -.62], scale: [3.1, .06, .7] }, 0xb4b8ac);
    ctx.metal.box({ position: [-.7, 1.55, -.68], scale: [1, .5, .4] }, 0x6d726a);
    for (const px of [-1.6, 1.6]) for (const pz of [-.9, .9]) ctx.metal.box({ position: [px, 1.2, pz], scale: [.07, 2.4, .07] }, 0x8a8f86);
    const roof = ctx.canvas.box({ position: [0, 2.45, 0], scale: [3.9, .08, 2.1], rotation: [.08, 0, 0] }, colour);
    ctx.canvas.box({ position: [0, 2.2, 1.03], scale: [3.9, .4, .05] }, stalls % 2 ? 0xe8dfc8 : 0xa8402f);
    for (const tableX of [-.85, .85]) {
      ctx.solid.box({ position: [tableX, .74, .3], scale: [1.1, .06, .55] }, 0x8e7a5d);
      for (const stoolZ of [-.1, .72]) ctx.solid.box({ position: [tableX, .23, stoolZ], scale: [.34, .46, .34] }, 0x3d6b8f);
    }
    ctx.glow.box({ position: [0, 2.15, .1], scale: [.22, .14, .22] }, 0xffd9a0);
    ctx.solid.base = ctx.metal.base = ctx.canvas.base = ctx.glow.base = null;
    ctx.obstacles.push({ x, z, halfX, halfZ, surface: 'metal' });
    ctx.anchor('stall', x, z, face.yaw, 0, { halfX, halfZ });
    ctx.addStallBreakable(x, 2.45, z, roof, face.yaw);
    stalls++;
  }
  // laundry bamboo poles (static decoration, never ignited)
  const pastel = [0xe9d8c4, 0x9fc4d6, 0xe3a6a0, 0xb8d3a5, 0xf0e6a6];
  for (let n = 0; n < 16; n++) {
    const block = blocks[Math.floor(hash(n * 3 + 7) * blocks.length)]!;
    const faceIndex = n % 4, face = facePlacements(block)[faceIndex]!;
    const tangent = (hash(n + 40) < .5 ? -1 : 1) * (6 + hash(n + 50) * 12), height = 9 + (n % 5) * 1.9;
    const nx = Math.sin(face.yaw), nz = Math.cos(face.yaw), tx = Math.cos(face.yaw), tz = -Math.sin(face.yaw);
    const x = face.x + tx * tangent, z = face.z + tz * tangent;
    ctx.solid.base = ctx.canvas.base = place(x, height, z, face.yaw).clone();
    ctx.solid.box({ position: [0, 0, 1.4], scale: [.08, .08, 2.8], rotation: [0, 0, .06] }, 0xb5a15e);
    for (let cloth = 0; cloth < 3; cloth++) ctx.canvas.box({ position: [0, -.42, .55 + cloth * .75], scale: [.05, .75, .5] }, pastel[(n + cloth) % pastel.length]!);
    ctx.solid.base = ctx.canvas.base = null;
    ctx.anchor('laundry', x + nx * 1.4, z + nz * 1.4, face.yaw, height);
  }
}

/** Light-box bus-stop ad panel on a shelter (breakable `neon`). Called by street-props. */
export function addLightbox(ctx: HkContext, x: number, z: number, side: number, ad: number): void {
  const slot = `ad-${ad % LIGHTBOX_ADS.length}`;
  ctx.atlas.define(slot, LIGHTBOX_ADS[ad % LIGHTBOX_ADS.length]!, 192, 256);
  // yaw 0: panel plane normal is +x/-x (faces along the street axis crossing), width runs along the shelter (z)
  const px = x - side * 1.05;
  ctx.addSignPair('neon', slot, LIGHTBOX_ADS[ad % LIGHTBOX_ADS.length]!.text, px, 1.35, z + 2.2, 0, 1.6, 1.9, ad, 3);
  ctx.anchor('busstop', x, z, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
}
