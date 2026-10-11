import type { Obstacle } from './render/world';

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const angleDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const forward = (yaw: number): readonly [number, number] => [-Math.sin(yaw), -Math.cos(yaw)];

export function blocked(x: number, z: number, obstacles: readonly Obstacle[], radius = 2.3): boolean {
  if (Math.abs(x) > 223 || Math.abs(z) > 223) return true;
  return obstacles.some(box => Math.abs(x - box.x) < box.halfX + radius && Math.abs(z - box.z) < box.halfZ + radius);
}

export function wallFraction(x: number, z: number, dx: number, dz: number, obstacles: readonly Obstacle[], clearance = 0): number {
  let first = 1;
  for (const box of obstacles) {
    let enter = 0;
    let exit = 1;
    for (const [start, delta, centre, half] of [[x, dx, box.x, box.halfX + clearance], [z, dz, box.z, box.halfZ + clearance]]) {
      if (start === undefined || delta === undefined || centre === undefined || half === undefined) continue;
      if (Math.abs(delta) < 0.00001) {
        if (start < centre - half || start > centre + half) { exit = -1; break; }
      } else {
        const a = (centre - half - start) / delta;
        const b = (centre + half - start) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit && enter >= 0 && enter < first) first = enter;
  }
  return first;
}

export function segmentSphere(sx: number, sy: number, sz: number, dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number, radius: number): number | null {
  const ox = sx - cx, oy = sy - cy, oz = sz - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (a < 1e-8 || discriminant < 0) return null;
  const near = (-b - Math.sqrt(discriminant)) / (2 * a);
  return near >= 0 && near <= 1 ? near : null;
}
