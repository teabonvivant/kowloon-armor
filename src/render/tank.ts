import * as THREE from 'three';
import type { TankSpec } from '../data/tanks';
import { FAMILY_SHAPES, slopedHull, trackGeometry, wheelGeometry, wheelMaterial } from './geo-tank';
import { GeometryBatch, glowMaterial, metalMaterial, unitSphere } from './materials';
import { addTankDetails, tankPaint } from './tank-details';

export interface TankVisual {
  readonly root: THREE.Group;
  readonly turret: THREE.Group;
  readonly barrel: THREE.Group;
  readonly wheels: THREE.InstancedMesh;
  wheelPhase: number;
  recoil: number;
}

export function disposeTank(visual: TankVisual): void {
  visual.root.traverse((node) => {
    if (node instanceof THREE.InstancedMesh) node.dispose();
  });
}

const turretForms = {
  western: { geometry: slopedHull, scale: 1, armor: 0.7, rack: 1.35 },
  eastern: { geometry: unitSphere, scale: 0.5, armor: 0.44, rack: 1.1 },
  merkava: { geometry: slopedHull, scale: 1, armor: 0.88, rack: 1.45 },
  futuristic: { geometry: slopedHull, scale: 1, armor: 0.9, rack: 1.25 },
} as const;

export function createTank(spec: TankSpec): TankVisual {
  const root = new THREE.Group();
  const turret = new THREE.Group();
  const barrel = new THREE.Group();
  const wheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, 14);
  const wheelPose = new THREE.Object3D();
  wheels.castShadow = true; wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(wheels);
  root.name = spec.name;
  turret.name = 'turret';
  barrel.name = 'barrel';
  const shape = FAMILY_SHAPES[spec.family];
  const form = turretForms[spec.family];
  const paint = new THREE.Color(spec.color);
  const lightPaint = paint.clone().lerp(new THREE.Color(0xc5c4a5), 0.2);
  const darkPaint = paint.clone().multiplyScalar(0.63);
  const hull = new GeometryBatch(tankPaint);
  const chassis = new GeometryBatch(metalMaterial);
  const lamps = new GeometryBatch(glowMaterial);

  hull.add(slopedHull, { position: [0, 1.3, 0], scale: [3.45, 1.23, 6.65] }, paint);
  hull.box({ position: [0, 1.95, 0.45], scale: [2.8, 0.17, 4.4] }, lightPaint);
  hull.box({ position: [0, 1.45, 3.3], scale: [3.02, 0.68, 0.17] }, darkPaint);
  hull.box({ position: [0, 1.78, -2.24], scale: [3.03, 0.15, 1.55], rotation: [-0.34, 0, 0] }, lightPaint);
  hull.box({ position: [0, 1.08, -3.28], scale: [2.64, 0.3, 0.19], rotation: [-0.15, 0, 0] }, darkPaint);

  for (const side of [-1, 1]) {
    chassis.add(trackGeometry, { position: [side * 1.73, 0.78, 0], scale: [1, 1, 1] }, 0x262a29);
    for (let index = 0; index < 7; index++) {
      wheelPose.position.set(side * 1.81, 0.71, -2.5 + index * 0.83);
      wheelPose.updateMatrix(); wheels.setMatrixAt((side < 0 ? 0 : 7) + index, wheelPose.matrix);
    }
    for (let index = 0; index < 31; index++) {
      const z = -3.05 + index * 0.205;
      chassis.box({ position: [side * 1.73, 0.145, z], scale: [0.65, 0.11, 0.065] }, 0x4c5047);
      chassis.box({ position: [side * 1.73, 1.43, z], scale: [0.65, 0.09, 0.065] }, 0x42473f);
    }
    for (let index = 0; index < 7; index++) {
      const z = -2.67 + index * 0.87;
      hull.box({ position: [side * 1.97, 1.52, z], scale: [0.14, 0.8, 0.82], rotation: [0, 0, side * 0.06] }, index % 3 === 0 ? darkPaint : paint);
      chassis.box({ position: [side * 2.052, 1.78, z], scale: [0.025, 0.03, 0.56] }, lightPaint);
      for (const boltZ of [-0.29, 0.29]) chassis.sphere({ position: [side * 2.055, 1.34, z + boltZ], scale: [0.024, 0.025, 0.025] }, 0xa8aa91);
    }
    hull.box({ position: [side * 1.8, 1.94, 0.1], scale: [0.7, 0.13, 6.85] }, lightPaint);
    hull.box({ position: [side * 1.8, 0.8, 3.34], scale: [0.6, 0.95, 0.08] }, 0x333932);
    chassis.box({ position: [side * 1.35, 1.46, -3.25], scale: [0.44, 0.26, 0.2] }, 0x242b28);
    lamps.box({ position: [side * 1.35, 1.46, -3.36], scale: [0.29, 0.14, 0.025] }, 0xf7e3ad);
    lamps.box({ position: [side * 1.18, 1.45, 3.4], scale: [0.19, 0.13, 0.025] }, 0xa52c26);
    chassis.cylinder({ position: [side * 0.99, 1.08, -3.39], scale: [0.085, 0.24, 0.085], rotation: [Math.PI / 2, 0, 0] }, 0x737967);
    hull.box({ position: [side * 1.1, 2.1, 2.15], scale: [0.42, 0.24, 1.25] }, darkPaint);
  }

  for (let index = 0; index < 14; index++) {
    chassis.box({ position: [-0.9 + index * 0.138, 2.05, 2.45], scale: [0.06, 0.065, 1.05] }, 0x252d29);
  }
  hull.cylinder({ position: [-0.6, 2.01, -1.77], scale: [0.44, 0.095, 0.45] }, darkPaint);
  chassis.box({ position: [-0.6, 2.085, -1.92], scale: [0.31, 0.075, 0.09] }, 0x151e1c);
  chassis.cylinder({ position: [0, 1.8, 0], scale: [1.28, 0.38, 1.28] }, 0x333e32);
  hull.finish(root);
  chassis.finish(root);
  lamps.finish(root, false);

  const armor = new GeometryBatch(tankPaint);
  const fittings = new GeometryBatch(metalMaterial);
  turret.position.set(0, 2.13, shape.turretZ);
  armor.add(form.geometry, { position: [0, 0.22, 0], scale: [shape.width * form.scale, shape.height * form.scale, shape.length * form.scale] }, paint);
  armor.box({ position: [0, 0.37, form.rack], scale: [2.57, 0.67, 0.58] }, darkPaint);
  armor.box({ position: [0, 0.67, form.rack], scale: [2.7, 0.09, 0.7] }, lightPaint);
  for (const side of [-1, 1]) {
    armor.add(slopedHull, { position: [side * 0.94, 0.23, -1.12], scale: [1.24, form.armor, 1.34], rotation: [0, side * -0.16, 0] }, lightPaint);
    armor.box({ position: [side * 1.51, 0.29, 0.43], scale: [0.17, 0.66, 1.78], rotation: [0, side * 0.07, 0] }, paint);
    for (let index = 0; index < 4; index++) {
      armor.box({ position: [side * (1.3 - index * 0.1), 0.66, -1.18 + index * 0.39], scale: [0.4, 0.17, 0.3], rotation: [0.13, side * 0.12, 0] }, index % 2 ? darkPaint : paint);
      fittings.cylinder({ position: [side * 1.65, 0.05 + index * 0.05, -0.32 + index * 0.22], scale: [0.074, 0.32, 0.074], rotation: [0.75, 0, side * 0.6] }, 0x333e32);
    }
    fittings.box({ position: [side * 1.39, 0.74, 1.03], scale: [0.055, 0.42, 1.05] }, 0x565f4e);
    for (let index = 0; index < 4; index++) fittings.box({ position: [side * 1.39, 0.74, 0.62 + index * 0.25], scale: [0.067, 0.42, 0.037] }, 0x303c31);
    fittings.cylinder({ position: [side * 1.09, 1.66, 1.34], scale: [0.018, 2.05, 0.018], rotation: [side * 0.035, 0, 0] }, 0x282e28);
    fittings.cylinder({ position: [side * 1.09, 0.78, 1.34], scale: [0.09, 0.32, 0.09] }, 0x323b30);
  }
  armor.cylinder({ position: [0.68, 0.8, 0.15], scale: [0.43, 0.16, 0.43] }, lightPaint);
  armor.cylinder({ position: [-0.69, 0.75, 0.34], scale: [0.38, 0.11, 0.43] }, darkPaint);
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    fittings.box({ position: [0.68 + Math.cos(angle) * 0.39, 0.82, 0.15 + Math.sin(angle) * 0.39], scale: [0.15, 0.11, 0.06], rotation: [0, -angle + Math.PI / 2, 0] }, 0x102927);
  }
  fittings.box({ position: [-0.56, 0.88, -0.77], scale: [0.41, 0.39, 0.36] }, darkPaint);
  fittings.box({ position: [-0.56, 0.9, -0.96], scale: [0.29, 0.17, 0.035] }, 0x173a3a);
  fittings.cylinder({ position: [0.57, 1.04, 0.06], scale: [0.066, 0.45, 0.066] }, 0x2c352c);
  fittings.box({ position: [0.57, 1.26, -0.14], scale: [0.14, 0.16, 0.56] }, 0x323a30);
  fittings.cylinder({ position: [0.57, 1.28, -0.72], scale: [0.031, 0.8, 0.031], rotation: [Math.PI / 2, 0, 0] }, 0x252e2a);
  armor.finish(turret);
  fittings.finish(turret);

  const cannon = new GeometryBatch(metalMaterial);
  barrel.position.set(0, 0.28, -1.42);
  cannon.box({ position: [0, 0, 0.06], scale: [0.72, 0.5, 0.52] }, darkPaint);
  const calibre = spec.gun / 1000;
  cannon.cylinder({ position: [0, 0, -1.83], scale: [calibre * 0.7, 3.55, calibre * 0.7], rotation: [Math.PI / 2, 0, 0] }, lightPaint);
  cannon.cylinder({ position: [0, 0, -0.65], scale: [0.135, 0.94, 0.135], rotation: [Math.PI / 2, 0, 0] }, paint);
  cannon.cylinder({ position: [0, 0, -1.7], scale: [0.153, 0.58, 0.153], rotation: [Math.PI / 2, 0, 0] }, darkPaint);
  for (const z of [-0.22, -1.18, -2.37, -3.46]) cannon.cylinder({ position: [0, 0, z], scale: [calibre * 0.89, 0.07, calibre * 0.89], rotation: [Math.PI / 2, 0, 0] }, 0x343e32);
  cannon.cylinder({ position: [0, 0, -3.61], scale: [calibre * 0.79, 0.26, calibre * 0.79], rotation: [Math.PI / 2, 0, 0] }, 0x54594e);
  cannon.cylinder({ position: [0, 0, -3.745], scale: [calibre * 0.56, 0.012, calibre * 0.56], rotation: [Math.PI / 2, 0, 0] }, 0x101715);
  cannon.finish(barrel);
  turret.add(barrel);
  root.add(turret);
  addTankDetails(root, turret, spec);
  root.scale.z = shape.lengthScale;
  wheels.computeBoundingSphere();
  return { root, turret, barrel, wheels, wheelPhase: 0, recoil: 0 };
}
const wheelTransform = new THREE.Object3D();
export function rotateWheels(visual: TankVisual, travel: number): void {
  if (Math.abs(travel) < .0001) return;
  visual.wheelPhase -= travel / .52;
  wheelTransform.rotation.x = visual.wheelPhase;
  for (const side of [-1, 1]) for (let index = 0; index < 7; index++) {
    wheelTransform.position.set(side * 1.81, .71, -2.5 + index * .83); wheelTransform.updateMatrix();
    visual.wheels.setMatrixAt((side < 0 ? 0 : 7) + index, wheelTransform.matrix);
  }
  visual.wheels.instanceMatrix.needsUpdate = true;
}
