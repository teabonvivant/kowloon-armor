import { Group } from 'three';
import { createSignMaterial, GeometryBatch, metalMaterial, unitPlane, windowMaterial } from './materials';
import type { Obstacle } from './world';

export function createStreetProps(): { group: Group; obstacles: Obstacle[] } {
  const group = new Group(); group.name = 'Shelters, street cabinets and road wear';
  const structure = new GeometryBatch(metalMaterial), surfaces = new GeometryBatch();
  const glass = new GeometryBatch(windowMaterial), wear = new GeometryBatch();
  const signs = new GeometryBatch(createSignMaterial({ text: '九龍演習區', subtitle: 'KOWLOON · TRAINING AREA', background: '#384a43', foreground: '#e9c58b' }));
  const obstacles: Obstacle[] = [];
  for (const road of [-84, 0, 84]) for (const row of [-126, 42, 126]) for (const side of [-1, 1]) {
    const x = road + side * 11.9, z = row - 8;
    structure.box({ position: [x, 3.2, z], scale: [2.1, .18, 7.4] }, 0x36544a);
    for (const end of [-1, 1]) {
      structure.box({ position: [x + side * .65, 1.6, z + end * 3.4], scale: [.11, 3.2, .11] }, 0x777d73);
      surfaces.box({ position: [x, .46, z + end * 2.4], scale: [.54, .8, .08] }, 0x4a5147);
    }
    structure.box({ position: [x, .92, z], scale: [.7, .12, 5.6] }, 0x898579);
    glass.box({ position: [x + side * .66, 1.8, z], scale: [.045, 2.35, 6.6] }, 0x566e65);
    signs.add(unitPlane, { position: [x - side * 1.08, 2.82, z], scale: [4.6, .6, 1], rotation: [0, -side * Math.PI / 2, 0] }, 0xffffff);
    surfaces.box({ position: [x, .65, z + 5], scale: [.64, 1.22, .7] }, 0x3b735a);
    structure.box({ position: [x - side * .34, .98, z + 5], scale: [.025, .17, .44] }, 0x202d29);
    obstacles.push({ x, z, halfX: 1, halfZ: 3.7 }, { x, z: z + 5, halfX: .35, halfZ: .4 });
    structure.cylinder({ position: [road + side * 7, .029, row + 16], scale: [.57, .022, .57] }, 0x444b43);
    for (let slot = -2; slot <= 2; slot++) wear.box({ position: [road + side * 7 + slot * .17, .043, row + 16], scale: [.045, .005, .72] }, 0x232f2b);
  }
  for (const road of [-168, -84, 0, 84, 168]) for (const row of [-130, -45, 45, 130]) {
    for (const side of [-1, 1]) {
      const x = road + side * 10.9;
      surfaces.box({ position: [x, .66, row + 4], scale: [.55, 1.3, .8] }, 0x9c9b88);
      structure.box({ position: [x - side * .29, .7, row + 4], scale: [.03, .8, .6] }, 0x7c8278);
    }
    for (let crack = 0; crack < 4; crack++) {
      wear.box({ position: [road + 3 + crack * .31, .026, row + Math.sin(crack * 2) * .26],
        scale: [.45, .008, .035], rotation: [0, (crack % 2 ? 1 : -1) * .6, 0] }, 0x353b37);
    }
    wear.box({ position: [road - 4, .024, row - 4], scale: [1.8, .012, 3.3] }, 0x51534d);
  }
  structure.finish(group); surfaces.finish(group);
  glass.finish(group, false); wear.finish(group, false); signs.finish(group, false);
  return { group, obstacles };
}
