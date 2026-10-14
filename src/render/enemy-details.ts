import { Group } from 'three';
import type { TankSpec } from '../data/tanks';
import { GeometryBatch, metalMaterial } from './materials';
import type { TankVisual } from './tank';

export type EnemyRole = '突擊' | '側襲' | '支援';
export function enemyRole(spec: TankSpec): EnemyRole {
  return spec.weight < 50 ? '側襲' : spec.gun >= 125 ? '支援' : '突擊';
}

export function addEnemyDetails(visual: TankVisual, role: EnemyRole): void {
  const group = new Group(); group.name = 'enemy-role-fittings';
  const fittings = new GeometryBatch(metalMaterial), markings = new GeometryBatch();
  const color = role === '突擊' ? 0xb77356 : role === '側襲' ? 0xd2ae68 : 0x91aebb;
  for (const side of [-1, 1]) {
    for (let band = 0; band < (role === '支援' ? 3 : role === '側襲' ? 2 : 1); band++) {
      markings.box({ position: [side * 2.064, 1.54, -.5 + band * .4], scale: [.02, .58, .19], rotation: [side * .25, 0, 0] }, color);
    }
    if (role === '突擊') for (let plate = 0; plate < 6; plate++) {
      fittings.box({ position: [side * 1.5, 2.08, -1.5 + plate * .5], scale: [.55, .19, .38], rotation: [0, 0, side * .1] }, 0x676b57);
    }
    if (role === '支援') {
      for (let rail = 0; rail < 6; rail++) fittings.box({ position: [side * 2.14, .98 + rail * .17, 2.7], scale: [.055, .045, 1.2] }, 0x6a7368);
      fittings.box({ position: [side * 1.25, 2.28, 2.5], scale: [.8, .38, 1.2] }, 0x535f50);
    }
    if (role === '側襲') {
      fittings.cylinder({ position: [side * 1.25, 3.25, 2.55], scale: [.015, 2.5, .015] }, 0x323f3b);
      markings.box({ position: [side * 1.25, 4.3, 2.55], scale: [.26, .15, .03] }, color);
    }
  }
  fittings.finish(group, false); markings.finish(group, false); visual.body.add(group);
}
