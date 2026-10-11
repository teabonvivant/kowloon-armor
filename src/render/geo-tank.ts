import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { unitBox } from './materials';

function createSlopedHull(): THREE.BufferGeometry {
  const geometry = unitBox.clone();
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    positions.setX(index, positions.getX(index) * (y > 0 ? 0.89 : 1));
    if (positions.getZ(index) < 0 && y > 0) positions.setZ(index, -0.33);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createTrack(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-2.75, -0.66);
  shape.lineTo(2.75, -0.66);
  shape.lineTo(3.3, -0.2);
  shape.lineTo(3.3, 0.3);
  shape.lineTo(2.9, 0.69);
  shape.lineTo(-2.9, 0.69);
  shape.lineTo(-3.3, 0.3);
  shape.lineTo(-3.3, -0.2);
  shape.closePath();
  const inner = new THREE.Path();
  inner.moveTo(-2.72, -0.43);
  inner.lineTo(-3.06, -0.1);
  inner.lineTo(-3.06, 0.22);
  inner.lineTo(-2.78, 0.46);
  inner.lineTo(2.78, 0.46);
  inner.lineTo(3.06, 0.22);
  inner.lineTo(3.06, -0.1);
  inner.lineTo(2.72, -0.43);
  inner.closePath();
  shape.holes.push(inner);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }).translate(0, 0, -0.3).rotateY(Math.PI / 2);
}

function createWheel(): THREE.BufferGeometry {
  const parts = [
    { radius: 0.54, depth: 0.38, color: 0x212729, offset: 0 },
    { radius: 0.415, depth: 0.41, color: 0x6a705b, offset: 0 },
    { radius: 0.32, depth: 0.425, color: 0x343d39, offset: 0 },
    { radius: 0.12, depth: 0.46, color: 0x929482, offset: 0 },
  ];
  const geometries = parts.map((part) => {
    const geometry = new THREE.CylinderGeometry(part.radius, part.radius, part.depth, 20).rotateZ(Math.PI / 2);
    const color = new THREE.Color(part.color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < colors.length; index += 3) { colors[index] = color.r; colors[index + 1] = color.g; colors[index + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  return mergeGeometries(geometries) ?? geometries[0] ?? new THREE.BufferGeometry();
}

export const slopedHull = createSlopedHull();
export const trackGeometry = createTrack();
export const wheelGeometry = createWheel();
export const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.48, roughness: 0.7 });

export const FAMILY_SHAPES = {
  western: { width: 3.3, length: 3.65, height: 0.95, lengthScale: 1, turretZ: -0.1 },
  eastern: { width: 3.05, length: 3.3, height: 0.72, lengthScale: 0.93, turretZ: -0.38 },
  merkava: { width: 3.35, length: 3.9, height: 0.82, lengthScale: 1.04, turretZ: 0.38 },
  futuristic: { width: 3.1, length: 3.85, height: 0.65, lengthScale: 1.02, turretZ: 0 },
} as const;
