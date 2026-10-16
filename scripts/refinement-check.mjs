import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const result = await build({ stdin: { resolveDir: resolve('.'), contents: `
export * from './src/render/realism-materials';
export * from './src/actors'; export * from './src/render/tank';
export * from './src/realism-ui'; export * from './src/effects';
export * from './src/combat';
export { TANKS } from './src/data/tanks';
export { Scene, Vector3, Color, NoColorSpace } from 'three';
` }, bundle: true, platform: 'node', format: 'esm', write: false, define: { __REALISM_SAMPLE__: 'true' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('paint, plaster and asphalt use finite unit normals in linear space rather than height derivatives', () => {
  for (const material of [api.armorPaint, api.agedPlaster, api.streetAsphalt()]) {
    assert.ok(material.normalMap, 'baked normal map required'); assert.equal(material.bumpMap, null);
    assert.equal(material.normalMap.colorSpace, api.NoColorSpace);
    const pixels = material.normalMap.image.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const length = Math.hypot(...[0,1,2].map(channel => pixels[offset + channel] / 255 * 2 - 1));
      assert.ok(Math.abs(length - 1) < .015); assert.ok(pixels[offset + 2] > 127);
    }
  }
});

test('street texture has square physical texels; matte street materials skip studio reflections', () => {
  const road = api.streetAsphalt();
  assert.ok(Math.abs(road.map.repeat.x / 300 - road.map.repeat.y / 340) < 1e-6);
  for (const material of [road,api.concrete,api.agedPlaster]) assert.equal(material.envMapIntensity,0);
});

test('enemy identification differs from player and survives damage shading without leaking shared material changes', () => {
  const player = api.createActor(api.TANKS[0],0,0,false), enemy = api.createActor(api.TANKS[0],0,-40,true);
  assert.ok(enemy.visual.root.getObjectByName('opposition-identification'));
  assert.equal(player.visual.root.getObjectByName('opposition-identification'), undefined);
  const firstPaint = visual => visual.body.children.find(node => node.material === api.armorPaint);
  const playerColor = new api.Color(), enemyColor = new api.Color();
  firstPaint(player.visual).getColorAt(0, playerColor); firstPaint(enemy.visual).getColorAt(0, enemyColor);
  assert.notEqual(playerColor.getHex(),enemyColor.getHex());
  const before = playerColor.getHex(); api.showTankDamage(enemy.visual,.2);
  firstPaint(player.visual).getColorAt(0, playerColor); assert.equal(playerColor.getHex(),before);
});

test('sample projectile is a narrow long rod rather than a full calibre cone', () => {
  const scene = new api.Scene(), effects = new api.Effects(scene), combat = new api.Combat(scene,effects,{ shot() {},hit() {} });
  const geometry = scene.getObjectByName('projectile-bodies').geometry;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new api.Vector3());
  assert.ok(size.x < .09 && size.y < .09 && size.z > .5 && size.z < .9);
  const player = api.createActor(api.TANKS[0],0,0,false); combat.fire(player,[]); combat.update(.01,[player],[],1);
  const tracer = scene.getObjectByName('projectile-tracers').instanceMatrix.array;
  assert.ok(Math.hypot(tracer[0],tracer[1],tracer[2]) < .025);
  assert.ok(Math.hypot(tracer[8],tracer[9],tracer[10]) <= 1.01);
  combat.dispose(); effects.dispose();
});

test('sample gun has no false muzzle brake side flames; reduced ground blast with elevated muzzle', () => {
  const low = new api.Effects(new api.Scene()), high = new api.Effects(new api.Scene());
  low.muzzle(new api.Vector3(0,2,0),new api.Vector3(0,0,-1),120,true);
  high.muzzle(new api.Vector3(0,6,0),new api.Vector3(0,0,-1),120,true);
  assert.equal(low.stats().flash,2); assert.equal(high.stats().dust,0); assert.ok(low.stats().dust > 0);
  low.clear(); assert.equal(low.stats().active,0); low.dispose(); high.dispose();
});

test('concrete and road produce debris without metallic spark showers; armor keeps sparks', () => {
  for (const kind of ['building','road','armor']) {
    const effects = new api.Effects(new api.Scene());
    effects.impact(new api.Vector3(0,1,0),new api.Vector3(0,1,0),new api.Vector3(0,-1,0),kind,120);
    assert.equal(effects.stats().sparks > 0,kind === 'armor'); assert.ok(effects.stats().debris > 0); effects.dispose();
  }
});

test('drive briefing describes a no-enemy exercise; branding is not a dead hyperlink', () => {
  const drive = api.realismGarageMarkup('drive','standard'), battle = api.realismGarageMarkup('battle','standard');
  assert.match(drive, /<h1>自由試車<\/h1>/); assert.doesNotMatch(drive, /停穩、瞄準，清除街口兩輛敵車/);
  assert.match(battle, /<h1>街口接敵<\/h1>/); assert.doesNotMatch(drive, /href="#"/);
});

test('sloped armor triangles retain UV area, including vertical side faces', () => {
  const player = api.createActor(api.TANKS[0],0,0,false);
  const geometry = player.visual.body.children.find(node => node.material === api.armorPaint).geometry;
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index += 3) {
    const area = (uv.getX(index + 1) - uv.getX(index)) * (uv.getY(index + 2) - uv.getY(index)) - (uv.getY(index + 1) - uv.getY(index)) * (uv.getX(index + 2) - uv.getX(index));
    assert.ok(Math.abs(area) > 1e-7, `triangle ${index / 3} must not collapse its texture into a line`);
  }
});

test('normal map uses wrapped neighbours at texture edges', () => {
  const source = api.armorPaint.map, normal = api.surfaceNormals(source), { width,height,data } = source.image;
  for (const [column,row] of [[0,0],[width - 1,height - 1],[0,13]]) {
    const sample = (horizontal,vertical) => data[((vertical + height) % height * width + (horizontal + width) % width) * 4] / 255;
    const horizontal = (sample(column - 1,row) - sample(column + 1,row)) * 2, vertical = (sample(column,row - 1) - sample(column,row + 1)) * 2;
    const length = Math.hypot(horizontal,vertical,1), offset = (row * width + column) * 4;
    assert.equal(normal.image.data[offset],Math.round((horizontal / length * .5 + .5) * 255));
    assert.equal(normal.image.data[offset + 1],Math.round((vertical / length * .5 + .5) * 255));
  }
  normal.dispose();
});
