import { Group } from 'three';
import { createSignMaterial, GeometryBatch, metalMaterial, unitPlane } from './materials';

export function districtAt(x: number, z: number): string {
  if (x > 50 && z > 40) return '尖沙咀 · 海港防線';
  if (x < -50 && z < -40) return '深水埗 · 工業街區';
  if (z < -40) return '旺角 · 霓虹街區';
  if (z > 40) return '油麻地 · 彌敦道';
  return '佐敦 · 中央路口';
}

export function createDistrictLandmarks(): Group {
  const group = new Group(); group.name = 'Kowloon district landmarks';
  const structures = new GeometryBatch(metalMaterial);
  const trim = new GeometryBatch();
  const markers = [
    { x: 13, z: 126, name: '油麻地', english: 'YAU MA TEI', color: '#e8a65a' },
    { x: 13, z: 42, name: '佐敦道', english: 'JORDAN ROAD', color: '#b7d3df' },
    { x: 13, z: -126, name: '旺角', english: 'MONG KOK', color: '#e38a70' },
    { x: -113, z: -126, name: '深水埗', english: 'SHAM SHUI PO', color: '#84c7b0' },
    { x: 97, z: 126, name: '海港防線', english: 'HARBOUR SECTOR', color: '#b7d3df' },
  ];
  for (const marker of markers) {
    const sign = new GeometryBatch(createSignMaterial({ text: marker.name, subtitle: marker.english,
      background: '#152327', foreground: marker.color }));
    sign.add(unitPlane, { position: [marker.x - .18, 6.4, marker.z], scale: [9.5, 2.3, 1], rotation: [0, -Math.PI / 2, 0] }, 0xffffff);
    structures.box({ position: [marker.x, 6.4, marker.z], scale: [.4, 2.6, 10] }, 0x26383a);
    sign.finish(group, false);
  }
  for (const side of [-1, 1]) {
    structures.box({ position: [97, 14, 126 + side * 9], scale: [1, 28, 1] }, 0x69838b);
    trim.box({ position: [97, 26, 126 + side * 4], scale: [1.6, .8, 20], rotation: [.18 * side, 0, 0] }, 0x9b8061);
    trim.box({ position: [13, 3.4, -126 + side * 8], scale: [4, .25, 7], rotation: [0, 0, -.15] }, 0x9b5546);
    structures.box({ position: [-113, 8.6, -126 + side * 6], scale: [.9, 2.4, 2.2] }, 0x647e70);
  }
  structures.box({ position: [12.8, 11.4, 42], scale: [.6, 4.8, 3.8] }, 0x334549);
  trim.box({ position: [12.44, 12.4, 42], scale: [.04, 1.7, 1.7] }, 0xd7d5bd);
  structures.box({ position: [12.39, 12.7, 42], scale: [.04, .75, .08] }, 0x24312d);
  structures.box({ position: [12.39, 12.4, 42.3], scale: [.04, .08, .65] }, 0x24312d);
  structures.finish(group, false); trim.finish(group, false);
  return group;
}
