import * as THREE from 'three';

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
export const unitSphere = new THREE.SphereGeometry(1, 16, 10);
export const unitPlane = new THREE.PlaneGeometry(1, 1);
export const solidMaterial = new THREE.MeshStandardMaterial({ roughness: 0.77, metalness: 0.23 });
export const metalMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.64 });
export const windowMaterial = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.5 });
export const glowMaterial = new THREE.MeshStandardMaterial({ roughness: 0.65, emissive: 0xffffff, emissiveIntensity: 0.6 });

export interface Pose {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

interface Instance {
  readonly pose: Pose;
  readonly color: THREE.ColorRepresentation;
}

export class GeometryBatch {
  private readonly entries = new Map<THREE.BufferGeometry, Instance[]>();
  constructor(private readonly material: THREE.Material = solidMaterial) {}

  add(geometry: THREE.BufferGeometry, pose: Pose, color: THREE.ColorRepresentation): void {
    const instances = this.entries.get(geometry) ?? [];
    instances.push({ pose, color });
    this.entries.set(geometry, instances);
  }

  box(pose: Pose, color: THREE.ColorRepresentation): void { this.add(unitBox, pose, color); }
  cylinder(pose: Pose, color: THREE.ColorRepresentation): void { this.add(unitCylinder, pose, color); }
  sphere(pose: Pose, color: THREE.ColorRepresentation): void { this.add(unitSphere, pose, color); }

  finish(group: THREE.Group, castShadow = true): void {
    const transform = new THREE.Object3D();
    for (const [geometry, instances] of this.entries) {
      const mesh = new THREE.InstancedMesh(geometry, this.material, instances.length);
      instances.forEach(({ pose, color }, index) => {
        transform.position.set(...pose.position);
        transform.scale.set(...pose.scale);
        transform.rotation.set(...(pose.rotation ?? [0, 0, 0]));
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        mesh.setColorAt(index, new THREE.Color(color));
      });
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
}

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
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.98, metalness: 0.02 });
}

export interface SignStyle {
  readonly text: string;
  readonly subtitle: string;
  readonly background: string;
  readonly foreground: string;
  readonly vertical?: boolean;
}

export function createSignMaterial(style: SignStyle): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = style.vertical ? 128 : 512;
  canvas.height = style.vertical ? 512 : 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = style.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = style.foreground;
    context.lineWidth = 3;
    context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    context.fillStyle = style.foreground;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = style.foreground;
    context.shadowBlur = 4;
    if (style.vertical) {
      context.font = 'bold 72px "Microsoft JhengHei", sans-serif';
      [...style.text].forEach((character, index) => context.fillText(character, 64, 66 + index * 94));
    } else {
      context.font = 'bold 56px "Microsoft JhengHei", sans-serif';
      context.fillText(style.text, 256, 48, 480);
      context.font = '19px Arial, sans-serif';
      context.fillText(style.subtitle, 256, 97, 470);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.38, roughness: 0.8, side: THREE.DoubleSide });
}
