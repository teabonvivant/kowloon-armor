import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Object3D, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PropKind } from '../game-events-v19';

/**
 * Hong Kong street-prop visuals (C10). Every prop is ONE mesh built from shared, vertex-coloured geometry
 * (cached per kind+variant) and two shared materials, so 20 props cost 20 cheap draws and no per-instance allocations.
 * Origin is ground level; footprints match arcade.ts collision radii (barrel r0.55, car 4.2x1.9, minibus 5.1x2.0, tanker 5.4x2.3).
 */
export interface PropVisual { root: Group; wreck(): void }

type Shape = 'box' | 'cyl';
interface Part { shape: Shape; pos: [number, number, number]; size: [number, number, number]; color: number; rot?: [number, number, number] | undefined }

const unitBox = new BoxGeometry(1, 1, 1), unitCylinder = new CylinderGeometry(1, 1, 1, 14);
const propMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .3 });
const burntMaterial = new MeshStandardMaterial({ color: 0x1b1a18, roughness: 1, metalness: 0 });
const pickupMaterials = {
  repair: new MeshStandardMaterial({ vertexColors: true, roughness: .5, emissive: 0x0f5a33, emissiveIntensity: .9 }),
  rapid: new MeshStandardMaterial({ vertexColors: true, roughness: .55, emissive: 0x7a3d00, emissiveIntensity: .9 }),
};
const ringMaterials = {
  repair: new MeshStandardMaterial({ color: 0x4fe08f, emissive: 0x178a4c, emissiveIntensity: 1.4, roughness: .4 }),
  rapid: new MeshStandardMaterial({ color: 0xffa23a, emissive: 0xb35a00, emissiveIntensity: 1.4, roughness: .4 }),
};
const ringGeometry = new TorusGeometry(1.25, .08, 6, 24);

const placer = new Object3D();
const cache = new Map<string, BufferGeometry>();
function build(parts: readonly Part[]): BufferGeometry {
  const pieces = parts.map(part => {
    const geometry = (part.shape === 'box' ? unitBox : unitCylinder).clone();
    placer.position.set(...part.pos); placer.rotation.set(...(part.rot ?? [0, 0, 0])); placer.scale.set(...part.size); placer.updateMatrix();
    geometry.applyMatrix4(placer.matrix);
    const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
    const r = (part.color >> 16 & 255) / 255, g = (part.color >> 8 & 255) / 255, b = (part.color & 255) / 255;
    for (let index = 0; index < count; index++) colors.set([r, g, b], index * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    return geometry;
  });
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged;
}
const box = (pos: Part['pos'], size: Part['size'], color: number, rot?: Part['rot']): Part => ({ shape: 'box', pos, size, color, rot });
const cyl = (pos: Part['pos'], size: Part['size'], color: number, rot?: Part['rot']): Part => ({ shape: 'cyl', pos, size, color, rot });
const wheels = (xs: readonly number[], z: number, radius: number): Part[] => xs.flatMap(x => [-1, 1].map(side =>
  cyl([x, radius, side * z], [radius, .28, radius], 0x1c1f1d, [Math.PI / 2, 0, 0])));

const BARREL_COLOURS = [0xb02a1e, 0x2f5f8a, 0x3d7a4b] as const;
function parts(kind: PropKind, variant: number): Part[] {
  switch (kind) {
    case 'barrel': {
      const colour = BARREL_COLOURS[variant % BARREL_COLOURS.length]!;
      return [cyl([0, .7, 0], [.55, 1.4, .55], colour), cyl([0, .25, 0], [.58, .12, .58], 0x2b2b29), cyl([0, 1.15, 0], [.58, .12, .58], 0x2b2b29),
        cyl([0, 1.41, 0], [.5, .04, .5], 0x9aa09a), box([0, 1.5, .1], [.16, .12, .16], 0xd7b94a)];
    }
    case 'lpg':
      return [cyl([0, .48, 0], [.34, .95, .34], 0xd9542b), cyl([0, .12, 0], [.37, .1, .37], 0x3a3a38), cyl([0, .93, 0], [.2, .1, .2], 0x2d2d2b),
        cyl([0, 1.02, 0], [.07, .1, .07], 0xc9a640), cyl([0, .85, 0], [.37, .16, .37], 0xf2c230)];
    case 'car': {
      const light = variant % 2 ? 0xf2e3a0 : 0xf3ecc9;
      return [box([0, .62, 0], [4.2, .72, 1.9], 0xc8261b), box([-.2, 1.2, 0], [2.2, .7, 1.7], 0xdadedb), box([-.2, 1.24, 0], [2.24, .38, 1.74], 0x2b3c40),
        box([-.2, 1.64, 0], [.62, .18, .3], light), box([2.12, .5, 0], [.14, .22, 1.9], 0x8c908c), box([-2.12, .5, 0], [.14, .22, 1.9], 0x8c908c),
        box([2.1, .75, .6], [.04, .16, .3], 0xffe9a8), box([2.1, .75, -.6], [.04, .16, .3], 0xffe9a8), ...wheels([-1.35, 1.35], .88, .38)];
    }
    case 'minibus': {
      const roof = variant % 2 ? 0x2e8b57 : 0xc23b2e;
      return [box([0, .95, 0], [5.1, 1.5, 2.0], 0xe9e3d0), box([0, .55, 0], [5.14, .2, 2.04], roof), box([0, 1.78, 0], [5.0, .18, 1.96], roof),
        box([0, 1.24, 0], [5.06, .5, 2.02], 0x2f4543), box([2.54, 1.3, 0], [.04, .55, 1.7], 0x2f4543), box([2.54, 1.72, 0], [.05, .16, 1.1], 0xffb347),
        box([2.55, .5, 0], [.1, .16, 2.0], 0x9a9d95), ...wheels([-1.65, 1.65], .92, .4)];
    }
    case 'tanker':
      return [cyl([0, 1.75, 0], [1.15, 5.4, 1.15], 0xcfd3d6, [0, 0, Math.PI / 2]), cyl([0, 1.75, 0], [1.17, .5, 1.17], 0xe07a1f, [0, 0, Math.PI / 2]),
        cyl([-1.2, 1.75, 0], [1.17, .3, 1.17], 0xe07a1f, [0, 0, Math.PI / 2]), cyl([1.2, 1.75, 0], [1.17, .3, 1.17], 0xe07a1f, [0, 0, Math.PI / 2]),
        box([-3.3, 1.3, 0], [1.6, 1.8, 2.3], 0xb02a1e), box([-3.75, 1.7, 0], [.06, .7, 1.9], 0x2f4543), box([0, .6, 0], [6.6, .4, 1.6], 0x2b2d2b),
        cyl([0, 2.95, 0], [.3, .2, .3], 0x8c908c), ...wheels([-3.1, .7, 1.9], 1.1, .55)];
    case 'transformer':
      return [box([0, 1.05, 0], [1.5, 2.1, 1.3], 0x5b6168), box([0, 2.2, 0], [1.6, .14, 1.4], 0x3c4147), box([0, 1.0, .66], [1.4, .35, .04], 0xf2c230),
        ...[-.45, 0, .45].map(x => cyl([x, 2.5, 0], [.1, .45, .1], 0xb59a6a)), box([0, 1.7, -.66], [.9, .5, .04], 0x8c908c)];
    default: {
      const impossible: never = kind;
      throw new TypeError(`Unexpected prop kind: ${String(impossible)}`);
    }
  }
}

/** Variants that actually differ; callers may pass any integer. */
const VARIANTS: Record<PropKind, number> = { barrel: 3, lpg: 1, car: 2, minibus: 2, tanker: 1, transformer: 1 };

function geometryFor(kind: PropKind, variant: number): BufferGeometry {
  const key = `${kind}:${Math.abs(Math.trunc(variant)) % VARIANTS[kind]}`;
  let geometry = cache.get(key);
  if (!geometry) { geometry = build(parts(kind, Math.abs(Math.trunc(variant)) % VARIANTS[kind])); cache.set(key, geometry); }
  return geometry;
}

export function createPropVisual(kind: PropKind, variant = 0): PropVisual {
  const root = new Group(); root.name = `prop-${kind}`;
  const mesh = new Mesh(geometryFor(kind, variant), propMaterial);
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.name = `prop-${kind}-body`;
  root.add(mesh);
  let wrecked = false;
  return {
    root,
    wreck(): void {
      if (wrecked) return;
      wrecked = true;
      mesh.material = burntMaterial;
      const lean = (Math.abs(Math.trunc(variant)) % 5 - 2) * .06;
      if (kind === 'barrel' || kind === 'lpg') mesh.scale.set(1.05, .6, 1.05);
      else mesh.scale.set(1.05, .4, 1.05);
      mesh.rotation.z = lean;
    },
  };
}

const pickupCache = new Map<string, BufferGeometry>();
export function createPickupVisual(kind: 'repair' | 'rapid'): Group {
  const root = new Group(); root.name = `pickup-${kind}`;
  let geometry = pickupCache.get(kind);
  if (!geometry) {
    geometry = build(kind === 'repair'
      ? [box([0, .55, 0], [1.1, .8, .75], 0xf2f2ee), box([0, .56, .39], [.7, .18, .02], 0xd62b2b), box([0, .56, .39], [.18, .6, .02], 0xd62b2b),
        box([0, .56, -.39], [.7, .18, .02], 0xd62b2b), box([0, .56, -.39], [.18, .6, .02], 0xd62b2b), box([0, 1.02, 0], [.5, .1, .1], 0x2a8f55)]
      : [box([0, .55, 0], [1.2, .28, .8], 0xd23a2f), box([0, .83, 0], [1.2, .28, .8], 0xf1f1ea), box([0, 1.11, 0], [1.2, .28, .8], 0x2f5fb0),
        box([0, .83, 0], [.12, 1.2, .84], 0x2b2b29), cyl([0, 1.3, 0], [.38, .1, .38], 0x8d6a3a)]);
    pickupCache.set(kind, geometry);
  }
  const body = new Mesh(geometry, pickupMaterials[kind]); body.name = `pickup-${kind}-body`; body.castShadow = false;
  const ring = new Mesh(ringGeometry, ringMaterials[kind]); ring.name = `pickup-${kind}-ring`; ring.rotation.x = Math.PI / 2; ring.position.y = .06;
  root.add(body, ring);
  return root;
}
