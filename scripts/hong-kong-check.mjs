import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export { createWorld } from './src/render/world';
  export { createActor, moveActor } from './src/actors';
  export { showTankDamage } from './src/render/tank';
  export { wallFraction } from './src/math';
  export { Color } from 'three';
  export { TANKS } from './src/data/tanks';
  export { loadPreferences, savePreferences } from './src/preferences';
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('six distinctive districts replace buildings without blocking the road network', () => {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  const world = api.createWorld(); delete globalThis.document;
  for (const name of ['尖沙咀鐘樓', '油麻地舊警署', '廟街牌樓', '旺角市集', '深水埗唐樓', '環球貿易廣場']) {
    const landmark = world.group.getObjectByName(name);
    assert.ok(landmark, `${name} must exist as geometry`);
    assert.ok(landmark.children.length > 1);
  }
  for (const road of [-168, -84, 0, 84, 168]) for (let along = -180; along <= 180; along += 3) {
    for (const [x, z] of [[road, along], [along, road]]) {
      assert.ok(world.obstacles.every(item => Math.abs(x - item.x) >= item.halfX + 2.3 || Math.abs(z - item.z) >= item.halfZ + 2.3), `road blocked ${x},${z}`);
    }
  }
});

test('every hostile tank gets role fittings without modifying its friendly counterpart', () => {
  for (const spec of api.TANKS) {
    const enemy = api.createActor(spec, 0, 0, true);
    const friendly = api.createActor(spec, 0, 0);
    assert.ok(enemy.visual.root.getObjectByName('enemy-role-fittings'), spec.id);
    assert.equal(friendly.visual.root.getObjectByName('enemy-role-fittings'), undefined);
    assert.ok(['突擊', '側襲', '支援'].includes(enemy.role));
    assert.equal(friendly.spec, spec);
  }
});

test('music has an independent persistent volume and migrates old settings', () => {
  const data = new Map([['kowloon-armor-settings', JSON.stringify({ volume: .2 })]]);
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const preferences = api.loadPreferences();
  assert.equal(preferences.musicVolume, .35); assert.equal(preferences.volume, .2);
  assert.equal(api.savePreferences({ ...preferences, musicVolume: 0 }), true);
  assert.equal(api.loadPreferences().musicVolume, 0);
  delete globalThis.localStorage;
});

test('market alleys can be driven end to end while stalls still block shells', () => {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  const world = api.createWorld(); delete globalThis.document;
  for (const x of [42, -126]) {
    const actor = api.createActor(api.TANKS[0], x, -86);
    for (let step = 0; step < 420; step++) api.moveActor(actor, 1, 0, false, 1 / 60, world.obstacles, [actor]);
    assert.ok(actor.visual.root.position.z < -160, 'No invisible whole-block collision across the market');
    assert.ok(api.wallFraction(x, -126, 16, 0, world.obstacles) < 1, 'Stall cover must stop projectiles');
  }
});

test('damage shading is idempotent and repairs restore original instance colours', () => {
  const actor = api.createActor(api.TANKS[0], 0, 0, true);
  const mesh = actor.visual.root.getObjectByName('enemy-role-fittings').children[0];
  const before = new api.Color(); mesh.getColorAt(0, before);
  api.showTankDamage(actor.visual, .2); api.showTankDamage(actor.visual, .2);
  const damaged = new api.Color(); mesh.getColorAt(0, damaged);
  assert.ok(Math.abs(damaged.r - before.r * .7) < 1e-6);
  api.showTankDamage(actor.visual, 1);
  const repaired = new api.Color(); mesh.getColorAt(0, repaired);
  assert.ok(Math.abs(repaired.r - before.r) < 1e-6);
});
