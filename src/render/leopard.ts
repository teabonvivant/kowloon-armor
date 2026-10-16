import * as THREE from 'three';
import type { TankSpec } from '../data/tanks';
import type { TankVisual } from './tank';
import { GeometryBatch, glowMaterial, unitBox } from './materials';
import { trackGeometry, wheelGeometry, wheelMaterial } from './geo-tank';
import { armorPaint, bareSteel, blackRubber, lensGlass } from './realism-materials';

function armoredSection(bottom: readonly (readonly [number, number])[], top: readonly (readonly [number, number])[], low: number, high: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const vertex = (point: readonly [number, number], height: number): number[] => [point[0], height, point[1]];
  for (let index = 0; index < bottom.length; index++) {
    const next = (index + 1) % bottom.length;
    positions.push(...vertex(bottom[index]!, low), ...vertex(top[next]!, high), ...vertex(top[index]!, high));
    positions.push(...vertex(bottom[index]!, low), ...vertex(bottom[next]!, low), ...vertex(top[next]!, high));
    positions.push(0, high, 0, ...vertex(top[index]!, high), ...vertex(top[next]!, high));
    positions.push(0, low, 0, ...vertex(bottom[next]!, low), ...vertex(bottom[index]!, low));
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const coordinates = new Float32Array(positions.length / 3 * 2);
  for (let triangle = 0; triangle < positions.length; triangle += 9) {
    const first = new THREE.Vector3().fromArray(positions,triangle), second = new THREE.Vector3().fromArray(positions,triangle + 3), third = new THREE.Vector3().fromArray(positions,triangle + 6);
    const normal = second.sub(first).cross(third.sub(first));
    const axis = Math.abs(normal.y) >= Math.max(Math.abs(normal.x),Math.abs(normal.z)) ? 1 : Math.abs(normal.x) > Math.abs(normal.z) ? 0 : 2;
    for (let corner = 0; corner < 3; corner++) {
      const index = triangle / 3 + corner;
      coordinates[index * 2] = (positions[index * 3 + (axis === 0 ? 2 : 0)] ?? 0) * .3;
      coordinates[index * 2 + 1] = (positions[index * 3 + (axis === 1 ? 2 : 1)] ?? 0) * .3;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(coordinates, 2)); geometry.computeVertexNormals(); return geometry;
}

const hullGeometry = armoredSection([[-1.55,-3.7],[-1.72,-2.7],[-1.72,3.25],[-1.5,3.65],[1.5,3.65],[1.72,3.25],[1.72,-2.7],[1.55,-3.7]], [[-1.48,-2.8],[-1.65,-2.25],[-1.65,3.05],[-1.45,3.35],[1.45,3.35],[1.65,3.05],[1.65,-2.25],[1.48,-2.8]], .92, 1.85);
const turretGeometry = armoredSection([[-.48,-2.08],[-1.73,-1.13],[-1.62,1.48],[-1.3,2.08],[1.3,2.08],[1.62,1.48],[1.73,-1.13],[.48,-2.08]], [[-.5,-1.36],[-1.43,-.73],[-1.34,1.43],[-1.16,1.72],[1.16,1.72],[1.34,1.43],[1.43,-.73],[.5,-1.36]], -.07, .77);
const wedgeGeometry = armoredSection([[-.62,-.91],[-.7,.15],[-.49,.58],[.47,.58],[.68,.03],[.58,-.73]], [[-.47,-.48],[-.53,.17],[-.39,.5],[.4,.5],[.52,.06],[.49,-.42]], -.11, .67);
const contactMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
  vertexShader: 'varying vec2 point;void main(){point=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec2 point;void main(){vec2 delta=abs(point*2.-1.);float alpha=(1.-smoothstep(.2,1.,max(delta.x,delta.y)))*.44;gl_FragColor=vec4(.025,.032,.03,alpha);}' });
const contactGeometry = new THREE.PlaneGeometry(5.7, 8.8);

export function createLeopard(spec: TankSpec): TankVisual {
  const root = new THREE.Group(); root.name = `${spec.name} · sample`;
  const body = new THREE.Group(); body.name = 'suspended-body'; root.add(body);
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, 2.02, -.1); body.add(turret);
  const barrel = new THREE.Group(); barrel.name = 'fixed-gun-cradle'; barrel.position.set(0, .3, -1.7); turret.add(barrel);
  const recoilTube = new THREE.Group(); recoilTube.name = 'recoiling-barrel'; barrel.add(recoilTube);
  const muzzleTip = new THREE.Object3D(); muzzleTip.name = 'physical-muzzle'; muzzleTip.position.z = -4.62; recoilTube.add(muzzleTip);
  const paint = 0x4e604b, lighter = 0x627057, darker = 0x3b4938;
  const hull = new GeometryBatch(armorPaint), steel = new GeometryBatch(bareSteel), rubber = new GeometryBatch(blackRubber), glass = new GeometryBatch(lensGlass);
  hull.add(hullGeometry, { position: [0, 0, 0], scale: [1,1,1] }, paint);
  hull.box({ position: [0,1.86,1.77], scale: [2.8,.12,2.7] }, darker);
  for (const side of [-1, 1]) {
    hull.box({ position: [side * 1.8,1.79,-.02], scale: [.73,.16,7.15] }, paint);
    for (let panel = 0; panel < 6; panel++) {
      const along = -2.73 + panel * 1.02;
      hull.box({ position: [side * 2,1.46,along], scale: [.18,.68,.97], rotation: [0,0,side * .04] }, panel < 3 ? lighter : paint);
      steel.box({ position: [side * 2.1,1.69,along], scale: [.025,.045,.64] }, 0x43483e);
      for (const bolt of [-.31,.31]) steel.cylinder({ position: [side * 2.11,1.32,along + bolt], scale: [.032,.045,.032], rotation: [0,0,Math.PI / 2] }, 0x63695a);
    }
    rubber.box({ position: [side * 1.76,.72,3.49], scale: [.68,1.1,.075] }, 0x96968d);
    hull.box({ position: [side * 1.11,1.54,-3.24], scale: [.44,.32,.27] }, paint);
    glass.box({ position: [side * 1.11,1.55,-3.39], scale: [.28,.17,.025] }, 0xe0dfc2);
    steel.cylinder({ position: [side * 1.18,1.06,-3.6], scale: [.1,.25,.1], rotation: [Math.PI / 2,0,0] }, 0x70756a);
    steel.box({ position: [side * 1.05,1.26,3.65], scale: [.7,.18,.12] }, 0x262b28);
    hull.box({ position: [side * 1.15,1.81,2.8], scale: [.57,.23,.83] }, darker);
    for (let vent = 0; vent < 9; vent++) steel.box({ position: [side * .77,1.94,1.6 + vent * .13], scale: [.82,.04,.045] }, 0x262d28);
    steel.cylinder({ position: [side * 1.82,.78,-3.03], scale: [.4,.45,.4], rotation: [0,0,Math.PI / 2] }, 0x545a4f);
    steel.cylinder({ position: [side * 1.82,.78,3.03], scale: [.43,.45,.43], rotation: [0,0,Math.PI / 2] }, 0x565e4d);
  }
  hull.cylinder({ position: [-.6,1.95,-1.88], scale: [.44,.1,.51] }, paint);
  glass.box({ position: [-.6,2.02,-2.13], scale: [.35,.1,.08] }, 0x95c1bd);
  steel.cylinder({ position: [0,1.94,-.1], scale: [1.35,.22,1.35] }, 0x454d40);
  for (const side of [-1,1]) {
    steel.cylinder({ position: [side * .9,1.05,3.77], scale: [.035,1.4,.035], rotation: [0,0,Math.PI / 2] }, 0x787b6c);
    hull.box({ position: [side * 1.37,1.05,3.7], scale: [.13,.23,.13] }, darker);
    for (const offset of [-.23,.23]) steel.box({ position: [side * 1.11 + offset,1.58,-3.43], scale: [.028,.33,.035] }, 0x6e7962);
    steel.box({ position: [side * 1.11,1.76,-3.43], scale: [.5,.025,.035] }, 0x6e7962);
    steel.cylinder({ position: [side * 1.9,2.05,-3.2], scale: [.018,.62,.018] }, 0x68765d);
    steel.sphere({ position: [side * 1.9,2.38,-3.2], scale: [.035,.035,.035] }, 0xdbd5bc);
    rubber.box({ position: [side * .91,1.86,-2.25], scale: [.64,.022,.65] }, 0x858c77);
    for (let stripe = 0; stripe < 6; stripe++) steel.box({ position: [side * .91,1.88,-2.5 + stripe * .1], scale: [.57,.01,.016] }, 0x667260);
    rubber.box({ position: [side * .69,1.93,2.55], scale: [.018,.014,1.11] }, 0x6a7563);
    for (const along of [2.1,2.9]) steel.cylinder({ position: [side * .68,1.96,along], scale: [.035,.17,.035], rotation: [0,0,Math.PI / 2] }, 0x7b846d);
    hull.box({ position: [side * 1.12,1.51,3.53], scale: [.78,.17,.3], rotation: [.2,0,0] }, darker);
    rubber.box({ position: [side * 1.12,1.37,3.68], scale: [.63,.14,.02] }, 0x44483d);
    steel.box({ position: [side * 1.55,1.08,3.69], scale: [.13,.16,.025] }, 0xc3a568);
  }
  hull.finish(body); steel.finish(body); rubber.finish(body); glass.finish(body);
  const turretArmor = new GeometryBatch(armorPaint), turretSteel = new GeometryBatch(bareSteel), optics = new GeometryBatch(lensGlass);
  turretArmor.add(turretGeometry, { position: [0,0,0], scale: [1,1,1] }, paint);
  for (const side of [-1,1]) {
    turretArmor.add(wedgeGeometry, { position: [side * 1.1,.02,-1.15], scale: [1,1,1], rotation: [0,side * -.15,0] }, lighter);
    turretArmor.box({ position: [side * 1.59,.2,.72], scale: [.21,.65,1.48], rotation: [0,side * .06,0] }, paint);
    turretArmor.box({ position: [side * 1.53,.56,.93], scale: [.42,.26,.45] }, darker);
    optics.box({ position: [side * 1.77,.56,.93], scale: [.027,.17,.32] }, 0x8badaa);
    for (let launcher = 0; launcher < 4; launcher++) turretSteel.cylinder({ position: [side * 1.63,.24, -.08 + launcher * .24], scale: [.066,.34,.066], rotation: [.72,0,side * .66] }, 0x6a705f);
    turretSteel.box({ position: [side * 1.32,.53,1.85], scale: [.065,.52,.62] }, 0x59614e);
    turretSteel.cylinder({ position: [side * 1.08,1.47,1.49], scale: [.012,1.8,.012], rotation: [side * .06,0,side * -.02] }, 0x353e32);
    for (let rack = 0; rack < 6; rack++) turretSteel.box({ position: [side * 1.32,.55,1.56 + rack * .12], scale: [.04,.44,.025] }, 0x8a8b70);
    turretArmor.box({ position: [side * .9,.08,2.11], scale: [.8,.43,.22] }, darker);
  }
  turretArmor.box({ position: [0,.62,1.6], scale: [2.7,.19,.68] }, darker);
  turretArmor.cylinder({ position: [.65,.84,.38], scale: [.45,.13,.45] }, lighter);
  turretArmor.cylinder({ position: [-.65,.82,.49], scale: [.4,.1,.44] }, paint);
  for (const side of [-1,1]) {
    for (let periscope = 0; periscope < 7; periscope++) {
      const angle = periscope * Math.PI * 2 / 7;
      optics.box({ position: [side * .65 + Math.cos(angle) * .37,.91,.43 + Math.sin(angle) * .37], scale: [.14,.095,.06], rotation: [0,-angle + Math.PI / 2,0] }, 0x779b90);
    }
    for (const offset of [-.14,.14]) turretSteel.box({ position: [side * .65 + offset,.97,.5], scale: [.025,.085,.045] }, 0x798570);
    turretSteel.box({ position: [side * .65,.999,.5], scale: [.3,.025,.045] }, 0x798570);
    turretSteel.box({ position: [side * 1.12,.797,.66], scale: [.025,.018,1.58] }, 0x84907a);
    for (let hook = 0; hook < 5; hook++) turretSteel.box({ position: [side * 1.18,.855,-.45 + hook * .4], scale: [.08,.035,.04] }, 0x829078);
    for (let rail = 0; rail < 8; rail++) turretSteel.box({ position: [side * (1.48 + rail % 2 * .01),.38 + Math.floor(rail / 2) * .12,1.12], scale: [.027,.027,1.04] }, 0x717e65);
  }
  turretArmor.cylinder({ position: [-.1,.89,1.72], scale: [.23,1.7,.23], rotation: [0,0,Math.PI / 2] }, 0x475741);
  for (const strap of [-.6,.44]) turretSteel.box({ position: [strap,.93,1.72], scale: [.055,.45,.38] }, 0x414c37);
  turretSteel.box({ position: [0,.83,1.35], scale: [2.4,.035,.035] }, 0x869074);
  for (let vent = 0; vent < 11; vent++) turretSteel.box({ position: [-.64 + vent * .115,.801,.98], scale: [.047,.014,.38] }, 0x3c4536);
  turretArmor.box({ position: [-.72,.83,-.78], scale: [.53,.39,.48] }, darker);
  optics.box({ position: [-.72,.86,-1.03], scale: [.39,.22,.022] }, 0x8ab0ad);
  turretArmor.cylinder({ position: [.69,1.08,-.03], scale: [.17,.43,.17] }, darker);
  turretArmor.box({ position: [.69,1.28,-.03], scale: [.37,.24,.35] }, paint);
  optics.box({ position: [.69,1.28,-.21], scale: [.27,.14,.015] }, 0x699e99);
  turretSteel.box({ position: [-.51,1.06,.43], scale: [.13,.19,.53] }, 0x3b4438);
  turretSteel.cylinder({ position: [-.51,1.09,-.11], scale: [.025,.72,.025], rotation: [Math.PI / 2,0,0] }, 0x5b6258);
  for (const side of [-1,1]) {
    for (let link = 0; link < 3; link++) {
      turretSteel.box({ position: [side * 1.1,.16,2.25 + link * .03], scale: [.49,.13,.14], rotation: [0,0,link * .04] }, 0x626557);
      turretArmor.box({ position: [side * 1.1,.17,2.34 + link * .03], scale: [.3,.09,.035] }, 0x272e28);
    }
    turretSteel.box({ position: [side * .9,.28,2.24], scale: [.08,.15,.03] }, 0x89917c);
    turretSteel.box({ position: [side * .9,.16,2.235], scale: [.72,.016,.018] }, 0x333e32);
  }
  turretArmor.finish(turret); turretSteel.finish(turret); optics.finish(turret);
  const mantlet = new GeometryBatch(armorPaint);
  mantlet.box({ position: [0,0,.04], scale: [.84,.61,.68] }, darker);
  mantlet.cylinder({ position: [0,0,-.29], scale: [.24,.14,.24], rotation: [Math.PI / 2,0,0] }, paint); mantlet.finish(barrel);
  const gun = new GeometryBatch(armorPaint), bore = new GeometryBatch(bareSteel), opening = new GeometryBatch(blackRubber);
  gun.cylinder({ position: [0,0,-2.45], scale: [.095,4.3,.095], rotation: [Math.PI / 2,0,0] }, lighter);
  gun.cylinder({ position: [0,0,-.98], scale: [.143,1.39,.143], rotation: [Math.PI / 2,0,0] }, paint);
  gun.cylinder({ position: [0,0,-2.18], scale: [.168,.63,.168], rotation: [Math.PI / 2,0,0] }, darker);
  for (const along of [-.32,-1.64,-2.51,-3.48,-4.46]) bore.cylinder({ position: [0,0,along], scale: [.11,.047,.11], rotation: [Math.PI / 2,0,0] }, 0x697365);
  bore.cylinder({ position: [0,0,-4.57], scale: [.105,.1,.105], rotation: [Math.PI / 2,0,0] }, 0x657064);
  opening.cylinder({ position: [0,0,-4.624], scale: [.061,.008,.061], rotation: [Math.PI / 2,0,0] }, 0x181b19);
  for (const along of [-.75,-1.35,-2.88,-3.65]) opening.cylinder({ position: [0,0,along], scale: [.098,.016,.098], rotation: [Math.PI / 2,0,0] }, 0x646c5a);
  gun.box({ position: [0,.14,-4.4], scale: [.13,.14,.16] }, darker);
  gun.finish(recoilTube); bore.finish(recoilTube); opening.finish(recoilTube);
  const running = new GeometryBatch(blackRubber);
  for (const side of [-1,1]) running.add(trackGeometry, { position: [side * 1.73,.78,0], scale: [1,1,1] }, 0xa0a195);
  running.finish(root);
  const wheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, 14), treads = new THREE.InstancedMesh(unitBox, bareSteel, 120);
  wheels.name = 'seven-roadwheels-each-side'; treads.name = 'independent-track-links';
  wheels.castShadow = true; treads.castShadow = true; wheels.receiveShadow = true; treads.receiveShadow = true;
  wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); treads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(wheels,treads);
  const pose = new THREE.Object3D();
  for (const side of [-1,1]) for (let index = 0; index < 7; index++) {
    pose.position.set(side * 1.81,.71,-2.5 + index * .83); pose.updateMatrix(); wheels.setMatrixAt((side < 0 ? 0 : 7) + index, pose.matrix);
  }
  for (let index = 0; index < 120; index++) treads.setColorAt(index, new THREE.Color(index % 5 ? 0x53584c : 0x7c806f));
  const grounding = new THREE.Mesh(contactGeometry,contactMaterial); grounding.name = 'contact-shadow'; grounding.rotation.x = -Math.PI / 2; grounding.position.y = .035; root.add(grounding);
  const lamps = new GeometryBatch(glowMaterial);
  for (const side of [-1,1]) lamps.box({ position: [side * 1.2,1.29,3.72], scale: [.17,.1,.02] }, 0x6f2722);
  lamps.finish(body,false);
  wheels.computeBoundingSphere();
  return { root, body, turret, barrel, recoilTube, muzzleTip, wheels, treads, wheelPhase: 0, rightWheelPhase: 0, leftTreadPhase: 0, rightTreadPhase: 0,
    recoil: 0, shotAge: 2, stroke: .34, force: 1, shotBearing: 0, motionPitch: 0, wreckAge: 0 };
}

export function identifyOpposition(visual: TankVisual): void {
  const tint = new THREE.Color();
  visual.root.traverse(node => {
    if (!(node instanceof THREE.InstancedMesh) || node.material !== armorPaint || !node.instanceColor) return;
    for (let index = 0; index < node.count; index++) {
      node.getColorAt(index,tint); tint.lerp(new THREE.Color(0x9a8e6c),.7); node.setColorAt(index,tint);
    }
    node.instanceColor.needsUpdate = true;
  });
  const group = new THREE.Group(); group.name = 'opposition-identification';
  const stripe = new GeometryBatch(bareSteel);
  for (const side of [-1,1]) for (const along of [-1.6,-1.15]) stripe.box({ position: [side * 2.105,1.47,along], scale: [.015,.43,.12], rotation: [.45,0,0] }, 0xddd6bf);
  stripe.finish(group,false); visual.body.add(group);
}
