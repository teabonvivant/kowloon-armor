import * as THREE from 'three';
import type { TankSpec } from '../data/tanks';
import { FAMILY_SHAPES, slopedHull, trackGeometry, wheelGeometry, wheelMaterial } from './geo-tank';
import { GeometryBatch, glowMaterial, metalMaterial, unitSphere, unitBox } from './materials';
import { addTankDetails, tankPaint } from './tank-details';
import { gunProfile, recoilEnvelope } from '../effect-math';
import { REALISM_SAMPLE } from '../realism';
import { createLeopard } from './leopard';

export interface TankVisual {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  readonly turret: THREE.Group;
  readonly barrel: THREE.Group;
  readonly recoilTube?: THREE.Group;
  readonly muzzleTip?: THREE.Object3D;
  readonly wheels: THREE.InstancedMesh;
  readonly treads: THREE.InstancedMesh;
  wheelPhase: number;
  rightWheelPhase: number;
  leftTreadPhase: number;
  rightTreadPhase: number;
  recoil: number;
  shotAge: number; stroke: number; force: number; shotBearing: number; motionPitch: number; wreckAge: number;
}

export function disposeTank(visual: TankVisual): void {
  restoreTurret(visual);
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

const groundGeometry = new THREE.PlaneGeometry(5.6, 8);
const groundMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
  vertexShader: 'varying vec2 vUV;void main(){vUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec2 vUV;void main(){float a=pow(max(0.,1.-length(vUV*2.-1.)),.65)*.26;gl_FragColor=vec4(.07,.075,.06,a);}' });

export function createTank(spec: TankSpec): TankVisual {
  if (REALISM_SAMPLE && spec.id === 'leopard2a8') {
    const visual = createLeopard(spec); updateTreads(visual); visual.treads.computeBoundingSphere(); return visual;
  }
  const root = new THREE.Group();
  const turret = new THREE.Group();
  const barrel = new THREE.Group();
  const wheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, 14);
  const treads = new THREE.InstancedMesh(unitBox, metalMaterial, 120);
  treads.name = 'independent track links'; treads.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(treads);
  for (let index = 0; index < 120; index++) treads.setColorAt(index, new THREE.Color(index % 3 ? 0x444b43 : 0x747362));
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
  const body = new THREE.Group(); body.name = 'suspended-body';
  for (const child of [...root.children]) if (child !== wheels && child !== treads) body.add(child);
  root.add(body);
  const grounding = new THREE.Mesh(groundGeometry, groundMaterial); grounding.name = 'contact-shadow';
  grounding.rotation.x = -Math.PI / 2; grounding.position.y = .04; root.add(grounding);
  wheels.computeBoundingSphere();
  const visual = { root, body, turret, barrel, wheels, treads, wheelPhase: 0, rightWheelPhase: 0, leftTreadPhase: 0, rightTreadPhase: 0,
    recoil: 0, shotAge: 2, stroke: .42, force: 1, shotBearing: 0, motionPitch: 0, wreckAge: 0 };
  updateTreads(visual); treads.computeBoundingSphere();
  return visual;
}
export function muzzlePosition(visual: TankVisual, target: THREE.Vector3): THREE.Vector3 {
  if (visual.recoilTube) syncGunTransform(visual);
  visual.root.updateMatrixWorld(true);
  if (visual.muzzleTip) return visual.muzzleTip.getWorldPosition(target);
  return visual.barrel.localToWorld(target.set(0, 0, -3.745));
}
export function muzzleDirection(visual: TankVisual, target: THREE.Vector3): THREE.Vector3 {
  visual.root.updateMatrixWorld(true);
  if (REALISM_SAMPLE) {
    if (visual.recoilTube) syncGunTransform(visual);
    target.set(0, 0, -1);
    for (let part: THREE.Object3D | null = visual.barrel; part; part = part.parent) target.applyQuaternion(part.quaternion);
    return target.normalize();
  }
  return target.set(0, 0, -1).transformDirection(visual.barrel.matrixWorld);
}
const gunWorld = new THREE.Matrix4();
const gunParent = new THREE.Matrix4();
const gunRotation = new THREE.Quaternion();
const gunPosition = new THREE.Vector3();
const gunUnitScale = new THREE.Vector3(1, 1, 1);
function syncGunTransform(visual: TankVisual): void {
  visual.barrel.updateMatrix();
  visual.root.updateMatrixWorld(true);
  gunRotation.identity();
  for (let part: THREE.Object3D | null = visual.barrel; part; part = part.parent) gunRotation.premultiply(part.quaternion);
  gunPosition.setFromMatrixPosition(visual.barrel.matrixWorld);
  gunWorld.compose(gunPosition, gunRotation, gunUnitScale);
  gunParent.copy(visual.turret.matrixWorld).invert();
  visual.barrel.matrix.multiplyMatrices(gunParent, gunWorld);
  visual.barrel.matrixAutoUpdate = false;
  visual.barrel.matrixWorldNeedsUpdate = true;
  visual.root.updateMatrixWorld(true);
}
export function kickTank(visual: TankVisual, calibre: number, weight: number, bearing: number): void {
  const profile = gunProfile(calibre, weight);
  const residual = recoilEnvelope(visual.shotAge);
  visual.force = Math.min(1.6, profile.force + visual.force * residual * .25);
  visual.stroke = Math.min(.65, profile.stroke + visual.stroke * residual * .08);
  if (visual.recoilTube) { visual.shotAge = 0; visual.shotBearing = bearing; return; }
  visual.shotAge = .012; visual.shotBearing = bearing;
  updateTankMotion(visual, 0, visual.barrel.rotation.x, 0, true);
}
export function updateTankMotion(visual: TankVisual, dt: number, pitch: number, acceleration: number, reduced: boolean): void {
  visual.shotAge = Math.min(2, visual.shotAge + dt);
  visual.recoil = visual.stroke * recoilEnvelope(visual.shotAge);
  if (visual.recoilTube) {
    visual.recoilTube.position.z = visual.recoil;
    visual.motionPitch += (Math.max(-.014, Math.min(.014, -acceleration * .0012)) - visual.motionPitch) * (1 - Math.exp(-dt * 7));
    const response = visual.shotAge < 1.2 ? Math.sin(visual.shotAge * 18) * Math.exp(-visual.shotAge * 6) * visual.force : 0;
    visual.body.rotation.x = reduced ? 0 : visual.motionPitch + response * .014 * Math.cos(visual.shotBearing);
    visual.body.rotation.z = reduced ? 0 : -response * .012 * Math.sin(visual.shotBearing);
    visual.body.position.y = reduced ? 0 : -Math.abs(response) * .014;
    syncGunTransform(visual);
    return;
  }
  visual.barrel.position.set(0, .28 - Math.sin(pitch) * visual.recoil, -1.42 + Math.cos(pitch) * visual.recoil);
  const bounce = visual.shotAge < .9 ? Math.sin(visual.shotAge * 23) * Math.exp(-visual.shotAge * 7) * visual.force : 0;
  visual.motionPitch += (Math.max(-.018, Math.min(.018, -acceleration * .0014)) - visual.motionPitch) * (1 - Math.exp(-dt * 8));
  visual.body.rotation.x = reduced ? 0 : -bounce * .025 * Math.cos(visual.shotBearing) + visual.motionPitch;
  visual.body.rotation.z = reduced ? 0 : bounce * .024 * Math.sin(visual.shotBearing);
  visual.body.position.y = reduced ? 0 : -Math.abs(bounce) * .045;
}
const wheelTransform = new THREE.Object3D();
const damageColor = new THREE.Color();
export function showTankDamage(visual: TankVisual, health: number): void {
  const shade = health <= 0 ? .3 : health < .35 ? .7 : 1;
  const previous = Number(visual.root.userData['damageShade'] ?? 1);
  if (shade === previous) return;
  visual.root.traverse(node => {
    if (!(node instanceof THREE.InstancedMesh) || !node.instanceColor) return;
    for (let index = 0; index < node.count; index++) {
      node.getColorAt(index, damageColor); damageColor.multiplyScalar(shade / previous); node.setColorAt(index, damageColor);
    }
    node.instanceColor.needsUpdate = true;
  });
  visual.root.userData['damageShade'] = shade;
}
export function rotateWheels(visual: TankVisual, leftTravel: number, rightTravel = leftTravel): void {
  if (Math.abs(leftTravel) + Math.abs(rightTravel) < .0001) return;
  visual.wheelPhase -= leftTravel / .52; visual.rightWheelPhase -= rightTravel / .52;
  visual.leftTreadPhase += leftTravel; visual.rightTreadPhase += rightTravel;
  for (const side of [-1, 1]) for (let index = 0; index < 7; index++) {
    wheelTransform.rotation.x = side < 0 ? visual.wheelPhase : visual.rightWheelPhase;
    wheelTransform.position.set(side * 1.81, .71, -2.5 + index * .83); wheelTransform.updateMatrix();
    visual.wheels.setMatrixAt((side < 0 ? 0 : 7) + index, wheelTransform.matrix);
  }
  visual.wheels.instanceMatrix.needsUpdate = true;
  updateTreads(visual);
}
const treadTransform = new THREE.Object3D();
const arcLength = Math.PI * .66;
const trackLength = 11 + arcLength * 2;
function updateTreads(visual: TankVisual): void {
  treadTransform.scale.set(.66, .09, .14);
  for (const side of [-1, 1]) for (let index = 0; index < 60; index++) {
    const phase = side < 0 ? visual.leftTreadPhase : visual.rightTreadPhase;
    const distance = ((index / 60 * trackLength + phase) % trackLength + trackLength) % trackLength;
    let height = 1.44, along = -2.75, rotation = 0;
    if (distance < 5.5) along += distance;
    else if (distance < 5.5 + arcLength) {
      const angle = (distance - 5.5) / .66;
      along = 2.75 + Math.sin(angle) * .66; height = .78 + Math.cos(angle) * .66; rotation = angle;
    } else if (distance < 11 + arcLength) { along = 2.75 - (distance - 5.5 - arcLength); height = .12; }
    else {
      const angle = (distance - 11 - arcLength) / .66;
      along = -2.75 - Math.sin(angle) * .66; height = .78 - Math.cos(angle) * .66; rotation = angle;
    }
    treadTransform.position.set(side * 1.73, height, along); treadTransform.rotation.x = rotation; treadTransform.updateMatrix();
    visual.treads.setMatrixAt((side < 0 ? 0 : 60) + index, treadTransform.matrix);
  }
  visual.treads.instanceMatrix.needsUpdate = true;
}

/** v1.9 C11 turret launch: the turret group flies (<= 2 s) and lands beside the hull; reversible without disposal. */
interface TurretFlight {
  age: number; duration: number; landed: boolean;
  readonly home: THREE.Vector3; readonly homeRotation: THREE.Euler;
  readonly velocity: THREE.Vector3; readonly spin: THREE.Vector3; gravity: number; rest: number;
}
const turretFlights = new WeakMap<TankVisual, TurretFlight>();
const unit = (seed: number, salt: number): number => {
  let h = Math.imul((seed | 0) ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
export const TURRET_FLIGHT = { minSeconds: 1.5, maxSeconds: 2, minApex: 6, maxApex: 10 } as const;
export function launchTurret(visual: TankVisual, seed: number): void {
  if (turretFlights.has(visual)) return;
  const t = visual.turret, duration = TURRET_FLIGHT.minSeconds + unit(seed, 1) * (TURRET_FLIGHT.maxSeconds - TURRET_FLIGHT.minSeconds);
  const apex = TURRET_FLIGHT.minApex + unit(seed, 2) * (TURRET_FLIGHT.maxApex - TURRET_FLIGHT.minApex);
  const rest = .75, drop = Math.max(.1, t.position.y - rest);
  // vertical: y(T) = rest with apex height `apex` above launch -> g = vy^2 / (2 apex)
  const vy = (duration + Math.sqrt(duration * duration + drop * duration * duration / apex)) / (duration * duration / (2 * apex));
  const heading = unit(seed, 3) * Math.PI * 2, reach = 3 + unit(seed, 4) * 3;
  turretFlights.set(visual, { age: 0, duration, landed: false, home: t.position.clone(), homeRotation: t.rotation.clone(),
    velocity: new THREE.Vector3(Math.cos(heading) * reach / duration, vy, Math.sin(heading) * reach / duration),
    spin: new THREE.Vector3((unit(seed, 5) - .5) * 5, (unit(seed, 6) - .5) * 8, (unit(seed, 7) - .5) * 6),
    gravity: vy * vy / (2 * apex), rest });
}
/** Advances the flight; returns true while airborne, false once landed (or when not launched). */
export function updateTurretFlight(visual: TankVisual, dt: number): boolean {
  const f = turretFlights.get(visual);
  if (!f || f.landed || !(dt > 0)) return !!f && !f.landed;
  f.age = Math.min(f.duration, f.age + dt);
  const t = f.age, turret = visual.turret;
  turret.position.set(f.home.x + f.velocity.x * t, f.home.y + f.velocity.y * t - .5 * f.gravity * t * t, f.home.z + f.velocity.z * t);
  const settle = f.age >= f.duration;
  turret.rotation.set(f.homeRotation.x + f.spin.x * t, f.homeRotation.y + f.spin.y * t, f.homeRotation.z + f.spin.z * t);
  if (settle) { f.landed = true; turret.position.y = f.rest; turret.rotation.x = f.homeRotation.x + .12; turret.rotation.z = f.homeRotation.z - .18; }
  return !settle;
}
export const isTurretFlying = (visual: TankVisual): boolean => { const f = turretFlights.get(visual); return !!f && !f.landed; };
export const isTurretLaunched = (visual: TankVisual): boolean => turretFlights.has(visual);
/** Re-seats the turret on the hull and forgets the flight (call before restart / garage / disposeTank). */
export function restoreTurret(visual: TankVisual): void {
  const f = turretFlights.get(visual); if (!f) return;
  visual.turret.position.copy(f.home); visual.turret.rotation.copy(f.homeRotation);
  turretFlights.delete(visual);
}
