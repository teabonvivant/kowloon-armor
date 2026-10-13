import { CanvasTexture, Group, MeshStandardMaterial, SRGBColorSpace, DataTexture, RGBAFormat, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, FrontSide } from 'three';
import type { CityBlock } from './geo-buildings';
import type { Obstacle } from './world';
import { createSignMaterial, facadeMaterial, GeometryBatch, glowMaterial, metalMaterial, plasterMaterial, unitPlane } from './materials';

export const LANDMARKS = [
  { x: 126, z: 210, name: '尖沙咀鐘樓', english: 'TSIM SHA TSUI CLOCK TOWER', kind: 'clock' },
  { x: -42, z: 126, name: '油麻地舊警署', english: 'OLD YAU MA TEI POLICE STATION', kind: 'police' },
  { x: -42, z: 42, name: '廟街牌樓', english: 'TEMPLE STREET', kind: 'temple' },
  { x: 42, z: -126, name: '旺角市集', english: 'MONG KOK MARKET', kind: 'market' },
  { x: -126, z: -126, name: '深水埗唐樓', english: 'SHAM SHUI PO', kind: 'tonglau' },
  { x: -210, z: 126, name: '環球貿易廣場', english: 'WEST KOWLOON · ICC', kind: 'icc' },
] as const;

export function isLandmarkBlock(block: CityBlock): boolean {
  return LANDMARKS.some(landmark => landmark.x === block.x && landmark.z === block.z);
}

export function landmarkObstacles(block: CityBlock): Obstacle[] | undefined {
  const landmark = LANDMARKS.find(item => item.x === block.x && item.z === block.z);
  if (!landmark || !['market', 'tonglau'].includes(landmark.kind)) return undefined;
  const obstacles: Obstacle[] = [];
  for (const side of [-1, 1]) {
    obstacles.push({ x: block.x + side * (block.width / 2 - 7), z: block.z, halfX: 6.1, halfZ: block.depth / 2 - 1 });
    for (let stall = -3; stall <= 3; stall++) obstacles.push({ x: block.x + side * 11, z: block.z + stall * 7, halfX: 3.5, halfZ: 3.2 });
    for (const end of [-1, 1]) obstacles.push({ x: block.x + side * 7.1, z: block.z + end * (block.depth / 2 - 2.2), halfX: .1, halfZ: .1 });
  }
  return obstacles;
}

const brickPixels = new Uint8Array(128 * 128 * 4);
for (let row = 0; row < 128; row++) for (let column = 0; column < 128; column++) {
  const mortar = row % 16 < 2 || (column + (Math.floor(row / 16) % 2) * 16) % 32 < 2;
  const grain = ((row * 137 + column * 79) % 17) - 8, offset = (row * 128 + column) * 4;
  brickPixels[offset] = (mortar ? 155 : 158) + grain;
  brickPixels[offset + 1] = (mortar ? 146 : 105) + grain;
  brickPixels[offset + 2] = (mortar ? 126 : 81) + grain; brickPixels[offset + 3] = 255;
}
const brickTexture = new DataTexture(brickPixels, 128, 128, RGBAFormat);
brickTexture.wrapS = brickTexture.wrapT = RepeatWrapping; brickTexture.repeat.set(3, 7);
brickTexture.magFilter = LinearFilter; brickTexture.colorSpace = SRGBColorSpace; brickTexture.needsUpdate = true;
brickTexture.minFilter = LinearMipmapLinearFilter; brickTexture.generateMipmaps = true; brickTexture.anisotropy = 4;
const brickMaterial = new MeshStandardMaterial({ map: brickTexture, roughness: .93, bumpMap: brickTexture, bumpScale: .065 });

function clockMaterial(): MeshStandardMaterial {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#d9ceb2'; context.fillRect(0, 0, 256, 256);
    context.strokeStyle = '#323a36'; context.lineWidth = 9;
    context.beginPath(); context.arc(128, 128, 112, 0, Math.PI * 2); context.stroke();
    for (let hour = 0; hour < 12; hour++) {
      const angle = hour * Math.PI / 6;
      context.beginPath(); context.moveTo(128 + Math.sin(angle) * 91, 128 - Math.cos(angle) * 91);
      context.lineTo(128 + Math.sin(angle) * 104, 128 - Math.cos(angle) * 104); context.stroke();
    }
    context.lineWidth = 8; context.beginPath(); context.moveTo(91, 101); context.lineTo(128, 128); context.lineTo(128, 47); context.stroke();
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({ map: texture, roughness: .8, emissive: 0x443b27, emissiveMap: texture, emissiveIntensity: .3 });
}

export function createHongKong(blocks: readonly CityBlock[]): Group {
  const city = new Group(); city.name = 'Hong Kong landmark districts';
  for (const landmark of LANDMARKS) {
    const block = blocks.find(item => item.x === landmark.x && item.z === landmark.z);
    if (!block) continue;
    const group = new Group(); group.name = landmark.name; group.position.set(block.x, 0, block.z);
    if (landmarkObstacles(block)) group.position.y = -1.4;
    const stone = new GeometryBatch(plasterMaterial), metal = new GeometryBatch(metalMaterial);
    const windows = new GeometryBatch(facadeMaterial), lights = new GeometryBatch(glowMaterial);
    const width = block.width, depth = block.depth;
    stone.box({ position: [0, .8, 0], scale: [width, 1.6, depth] }, 0x767c78);
    stone.box({ position: [0, 1.62, 0], scale: [width, .12, depth] }, 0xaba999);
    if (landmark.kind === 'clock') {
      stone.box({ position: [0, 3.1, 0], scale: [11, 3, 11] }, 0xaaa493);
      const brick = new GeometryBatch(brickMaterial);
      brick.box({ position: [0, 20, 0], scale: [7.6, 32, 7.6] }, 0xffffff); brick.finish(group);
      for (const height of [5, 14, 26, 32, 36]) stone.box({ position: [0, height, 0], scale: [8.3, .7, 8.3] }, 0xd0c4a9);
      for (const x of [-3.5, 3.5]) for (const z of [-3.5, 3.5]) stone.box({ position: [x, 20, z], scale: [.7, 31, .7] }, 0xb8ab91);
      const clock = new GeometryBatch(clockMaterial());
      for (let face = 0; face < 4; face++) {
        const angle = face * Math.PI / 2;
        clock.add(unitPlane, { position: [Math.sin(angle) * 3.83, 29.5, Math.cos(angle) * 3.83], scale: [4.3, 4.3, 1], rotation: [0, angle, 0] }, 0xffffff);
        for (const height of [10, 19, 34]) windows.add(unitPlane, { position: [Math.sin(angle) * 3.85, height, Math.cos(angle) * 3.85], scale: [1.8, 3, 1], rotation: [0, angle, 0] }, 0x566259);
      }
      stone.box({ position: [0, 38, 0], scale: [5.8, 4, 5.8] }, 0xc6b99e);
      stone.cylinder({ position: [0, 40.8, 0], scale: [3.4, 1.4, 3.4] }, 0x596556);
      stone.sphere({ position: [0, 41.5, 0], scale: [2.7, 1.8, 2.7] }, 0x6a7764);
      metal.cylinder({ position: [0, 43.3, 0], scale: [.12, 1.4, .12] }, 0xbbac83);
      clock.finish(group, false);
      for (const x of [-20, 20]) for (const z of [-10, 10]) {
        stone.cylinder({ position: [x, 5, z], scale: [.3, 7, .3] }, 0x827258);
        for (let leaf = 0; leaf < 7; leaf++) {
          const angle = leaf * Math.PI * 2 / 7;
          stone.box({ position: [x + Math.sin(angle) * 1.7, 8, z + Math.cos(angle) * 1.7], scale: [.8, .15, 4], rotation: [.3, angle, 0] }, 0x526750);
        }
      }
    } else if (landmark.kind === 'police') {
      stone.box({ position: [0, 7, 0], scale: [width - 4, 11, depth - 4] }, 0xdac9a4);
      for (const level of [2, 6, 10, 13]) stone.box({ position: [0, level, 0], scale: [width - 2, .42, depth - 2] }, 0xefe1bf);
      for (let face = 0; face < 4; face++) {
        const angle = face * Math.PI / 2, outward = depth / 2 - 1.7;
        for (let column = -4; column <= 4; column++) {
          const offset = column * 5.6;
          const x = Math.cos(angle) * offset + Math.sin(angle) * outward;
          const z = -Math.sin(angle) * offset + Math.cos(angle) * outward;
          for (const height of [4, 8, 11.3]) {
            windows.add(unitPlane, { position: [x, height, z], scale: [2.2, 2.7, 1], rotation: [0, angle, 0] }, 0x92a79d);
            stone.box({ position: [x + Math.cos(angle) * 2.2, height, z], scale: [.55, 3.5, .65], rotation: [0, angle, 0] }, 0xeee0c2);
          }
        }
      }
      stone.box({ position: [0, 14.4, 0], scale: [width - 6, 2.4, depth - 6] }, 0x736b60);
      stone.box({ position: [0, 15.9, 0], scale: [width - 13, .6, depth - 13] }, 0xa4a093);
    } else if (landmark.kind === 'icc') {
      stone.box({ position: [0, 5, 0], scale: [width - 2, 7, depth - 2] }, 0x687c86);
      for (let tier = 0; tier < 5; tier++) {
        const span = 27 - tier * 1.2;
        stone.box({ position: [0, 23 + tier * 27, 0], scale: [span, 27, span] }, 0x637f8b);
        for (const side of [-1, 1]) for (let line = -5; line <= 5; line++) {
          metal.box({ position: [line * 2.1, 23 + tier * 27, side * (span / 2 + .04)], scale: [.16, 27, .12] }, 0xb0bcc0);
          metal.box({ position: [side * (span / 2 + .04), 23 + tier * 27, line * 2.1], scale: [.12, 27, .16] }, 0xb0bcc0);
        }
        for (let floor = 0; floor < 9; floor++) stone.box({ position: [0, 11 + tier * 27 + floor * 3, 0], scale: [span + .1, .12, span + .1] }, 0x9eafb1);
      }
      stone.box({ position: [0, 146, 0], scale: [20, 4, 20] }, 0x8b9ca0);
    } else {
      const temple = landmark.kind === 'temple';
      for (const side of [-1, 1]) {
        const x = side * (width / 2 - 7);
        const height = temple ? 15 : landmark.kind === 'tonglau' ? 24 : 33;
        stone.box({ position: [x, height / 2 + 1.6, 0], scale: [12, height, depth - 2] }, temple ? 0x8b8874 : side > 0 ? 0xb1a88d : 0x7a9993);
        for (let floor = 0; floor < Math.floor(height / 3.2); floor++) for (let column = -3; column <= 3; column++) {
          const z = column * 7.2, y = 3.4 + floor * 3.2;
          windows.add(unitPlane, { position: [x - side * 6.03, y, z], scale: [3, 2, 1], rotation: [0, -side * Math.PI / 2, 0] }, 0xb2c0ad);
          windows.add(unitPlane, { position: [x + side * 6.03, y, z], scale: [3, 2, 1], rotation: [0, side * Math.PI / 2, 0] }, 0xb2c0ad);
          stone.box({ position: [x - side * 6.8, y - 1, z], scale: [1.6, .2, 5.4] }, 0xc5baa0);
          metal.box({ position: [x - side * 7.4, y - .5, z], scale: [.08, .8, 5.4] }, 0x687c72);
          stone.box({ position: [x - side * 6.4, y + .8, z + 1.9], scale: [.8, .6, .9] }, 0xbbb9aa);
          stone.box({ position: [x + side * 6.4, y - .8, z + 1.6], scale: [.65, .6, .9] }, 0xbcbcaf);
        }
        for (const end of [-1, 1]) for (let floor = 0; floor < Math.floor(height / 3.2); floor++) {
          for (const offset of [-3, 3]) windows.add(unitPlane, { position: [x + offset, 3.4 + floor * 3.2, end * (depth / 2 - .94)], scale: [3.8, 2.1, 1], rotation: [0, end < 0 ? Math.PI : 0, 0] }, 0xb2c0ad);
        }
        for (let stall = -3; stall <= 3; stall++) {
          const z = stall * 7;
          stone.box({ position: [side * 11, 3.6, z], scale: [7, .18, 6.3], rotation: [0, 0, side * .12] }, stall % 2 ? 0x567e6d : 0xa85846);
          stone.box({ position: [side * 11, 2.3, z], scale: [5.8, 1.3, 4.8] }, 0x645d4c);
          for (const edge of [-1, 1]) metal.cylinder({ position: [side * 14, 2.6, z + edge * 2.7], scale: [.07, 2, .07] }, 0x96947d);
          for (let crate = 0; crate < 3; crate++) stone.box({ position: [side * 11, 3.08, z - 1.7 + crate * 1.6], scale: [2.7, .3, 1.2] }, crate % 2 ? 0x9f8a50 : 0x797450);
        }
      }
      if (temple) {
        for (const end of [-1, 1]) {
          const z = end * (depth / 2 - 3);
          for (const side of [-1, 1]) stone.cylinder({ position: [side * 6.5, 5.8, z], scale: [.6, 8.4, .6] }, 0xa14432);
          stone.box({ position: [0, 9, z], scale: [16, 1.4, 1.3] }, 0x973e2d);
          for (const side of [-1, 1]) stone.box({ position: [0, 10.1, z + side * 1.3], scale: [18, .35, 3.2], rotation: [side * .3, 0, 0] }, 0x566b53);
          for (let lamp = -2; lamp <= 2; lamp++) {
            lights.sphere({ position: [lamp * 2.5, 7.5, z], scale: [.5, .65, .5] }, 0xf08543);
            metal.cylinder({ position: [lamp * 2.5, 8.5, z], scale: [.025, 1, .025] }, 0x51473a);
          }
        }
      }
    }
    const signMaterial = createSignMaterial({ text: landmark.name, subtitle: landmark.english, background: '#233736', foreground: '#ead2a0' });
    signMaterial.side = FrontSide;
    const signs = new GeometryBatch(signMaterial);
    const signY = ['temple', 'market', 'tonglau'].includes(landmark.kind) ? 9 : 3.8;
    for (const side of [-1, 1]) {
      const signZ = side * (depth / 2 - 2.2);
      for (const facing of [-1, 1]) signs.add(unitPlane, { position: [0, signY, signZ + facing * .07], scale: [14, 2.8, 1], rotation: [0, facing < 0 ? Math.PI : 0, 0] }, 0xffffff);
      metal.box({ position: [0, signY, signZ], scale: [14.2, 3, .12] }, 0x3e5149);
      if (landmark.kind !== 'temple') for (const edge of [-1, 1]) metal.cylinder({ position: [edge * 7.1, signY / 2, signZ], scale: [.09, signY, .09] }, 0x576455);
    }
    stone.finish(group); metal.finish(group, false); windows.finish(group, false); lights.finish(group, false); signs.finish(group, false);
    city.add(group);
  }
  const harbour = new Group(); harbour.name = 'Victoria Harbour';
  const water = new GeometryBatch(new MeshStandardMaterial({ color: 0x41656d, roughness: .3, metalness: .45 }));
  water.box({ position: [0, -.4, 420], scale: [1100, .15, 340] }, 0xffffff);
  const detail = new GeometryBatch();
  detail.box({ position: [0, -.2, 620], scale: [1100, 1, 70] }, 0x697c79);
  detail.box({ position: [0, .1, 246], scale: [490, 1.6, 5] }, 0x92958a);
  for (let along = -240; along <= 240; along += 6) {
    detail.box({ position: [along, 1.3, 244], scale: [.16, 1.2, .16] }, 0xbac5bb);
    detail.box({ position: [along, 1.8, 244], scale: [6, .12, .12] }, 0xbac5bb);
  }
  for (let tower = 0; tower < 35; tower++) {
    const height = 20 + tower * 19 % 70;
    detail.box({ position: [-430 + tower * 26, height / 2, 610], scale: [19, height, 23] }, 0x778d91);
  }
  water.finish(harbour, false); detail.finish(harbour, false); city.add(harbour);
  return city;
}
