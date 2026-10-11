import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export * from './src/challenges.ts';
  export * from './src/preferences.ts';
  export { recordResult } from './src/persistence.ts';
  export { Game } from './src/game.ts';
  export { TANKS } from './src/data/tanks.ts';
  export { advanceEnemy, createActor } from './src/actors.ts';
  export { createWorld } from './src/render/world.ts';
  export { GeometryBatch } from './src/render/materials.ts';
  export { createTank, disposeTank } from './src/render/tank.ts';
  export { Scene, Group, Matrix4 } from 'three';
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const neutral = { throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false, brake: false, scope: false, toggleCamera: false, pause: false };
const fixture = () => new api.Game(new api.Scene(), { group: new api.Group(), obstacles: [], size: 460 }, {
  shot() {}, hit() {}, finish() {}, notify() {},
});

test('seeded opponents stay on roads, away from the player and one another', () => {
  const obstacles = [{ x: 0, z: -84, halfX: 8, halfZ: 8 }];
  const position = { x: 0, z: 100 };
  const first = api.encounterSpawns(42, 8, position, obstacles);
  assert.deepEqual(first, api.encounterSpawns(42, 8, position, obstacles));
  assert.notDeepEqual(first, api.encounterSpawns(43, 8, position, obstacles));
  for (let seed = 1; seed <= 100; seed++) {
    const spawns = api.encounterSpawns(seed, 8, position, obstacles);
    assert.equal(spawns.length, 8);
    for (const [index, [x, z]] of spawns.entries()) {
      assert.ok(Math.hypot(x, z - 100) >= 70);
      assert.ok(Math.abs(x) <= 168 && Math.abs(z) <= 168);
      assert.ok(!(Math.abs(x) < 11 && Math.abs(z + 84) < 11));
      for (const [otherX, otherZ] of spawns.slice(index + 1)) assert.ok(Math.hypot(x - otherX, z - otherZ) >= 12);
    }
  }
});

test('difficulty changes opponents while keeping the selected tank intact', () => {
  const game = fixture();
  game.start('campaign', 0, 'training');
  const easyHp = game.enemies[0].maxHp;
  const playerHp = game.player.maxHp;
  game.start('campaign', 0, 'veteran');
  assert.ok(game.enemies[0].maxHp > easyHp);
  assert.equal(game.player.maxHp, playerHp);
  assert.equal(game.difficulty, 'veteran');
  game.garage();
});

test('survival grants one repair between waves, pauses countdown, and caps live opponents', () => {
  const game = fixture();
  game.start('survival', 0, 'standard', 77);
  assert.equal(game.wave, 1);
  assert.equal(game.enemies.length, 2);
  game.player.hp = 100;
  for (const enemy of game.enemies) enemy.alive = false;
  game.update(1 / 60, neutral);
  assert.equal(game.phase, 'playing');
  assert.ok(game.intermission > 0);
  const countdown = game.intermission;
  game.pause(); game.update(5, neutral);
  assert.equal(game.intermission, countdown);
  game.resume();
  for (let frame = 0; frame < 481; frame++) game.update(1 / 60, neutral);
  assert.equal(game.wave, 2);
  assert.equal(game.enemies.length, 3);
  assert.equal(game.player.hp, 100 + Math.round(game.player.maxHp * .35));
  assert.ok(api.waveSize(100) <= 8);
  game.garage();
  assert.equal(game.intermission, 0);
});

test('records keep campaigns compatible and separate difficulty scores', () => {
  const initial = { completed: 1, victories: 1, bestScores: { '1': 3000 } };
  const lost = api.recordResult(initial, { mode: 'campaign', missionId: 2, difficulty: 'veteran', victory: false, score: 200, wave: 0 });
  assert.equal(lost.completed, 1);
  assert.equal(lost.victories, 1);
  const won = api.recordResult(initial, { mode: 'campaign', missionId: 2, difficulty: 'veteran', victory: true, score: 4000, wave: 0 });
  assert.equal(won.completed, 2);
  assert.equal(won.bestScores['campaign:2:veteran'], 4000);
  assert.equal(initial.completed, 1);
  const survived = api.recordResult(won, { mode: 'survival', missionId: 0, difficulty: 'standard', victory: false, score: 1500, wave: 3 });
  assert.equal(survived.bestScores['survival:0:standard'], 1500);
  assert.equal(survived.bestScores['wave:standard'], 3);
  const worse = api.recordResult(survived, { mode: 'survival', missionId: 0, difficulty: 'standard', victory: false, score: 500, wave: 1 });
  assert.equal(worse.bestScores['survival:0:standard'], 1500);
  assert.equal(worse.bestScores['wave:standard'], 3);
});

test('preferences validate persisted data and tolerate blocked storage', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const defaults = api.loadPreferences();
  assert.equal(defaults.quality, 'medium');
  assert.equal(api.savePreferences({ ...defaults, quality: 'low', sensitivity: 1.6, invertY: true }), true);
  assert.equal(api.loadPreferences().sensitivity, 1.6);
  assert.equal(api.loadPreferences().quality, 'low');
  data.set('kowloon-armor-settings', '{broken');
  assert.deepEqual(api.loadPreferences(), defaults);
  globalThis.localStorage = { getItem() { throw new DOMException('Denied', 'SecurityError'); }, setItem() { throw new DOMException('Full', 'QuotaExceededError'); } };
  assert.deepEqual(api.loadPreferences(), defaults);
  assert.equal(api.savePreferences(defaults), false);
  delete globalThis.localStorage;
});

test('spatial batches preserve every transform and colour with local bounds', () => {
  const group = new api.Group(), batch = new api.GeometryBatch();
  for (const x of [-168, 0, 168]) batch.box({ position: [x, 1, 0], scale: [2, 2, 2] }, 0x889977);
  batch.finish(group, false, 84);
  assert.equal(group.children.length, 3);
  const positions = group.children.map(mesh => {
    assert.equal(mesh.count, 1); assert.equal(mesh.castShadow, false);
    assert.ok(mesh.boundingSphere.radius < 2);
    const matrix = new api.Matrix4(); mesh.getMatrixAt(0, matrix); return matrix.elements[12];
  });
  assert.deepEqual(positions.sort((left, right) => left - right), [-168, 0, 168]);
});

test('each tank renders fourteen wheels in one animated batch and releases instance buffers', () => {
  const tank = api.createTank(api.TANKS[0]);
  assert.equal(tank.wheels.isInstancedMesh, true);
  assert.equal(tank.wheels.count, 14);
  let disposed = 0;
  tank.root.traverse(node => { if (node.isInstancedMesh) node.addEventListener('dispose', () => disposed++); });
  api.disposeTank(tank);
  assert.ok(disposed > 5);
});

test('nearby opponents keep moving when a building blocks their line of fire', () => {
  const player = api.createActor(api.TANKS[0], 0, 100);
  const enemy = api.createActor(api.TANKS[1], 30, 75, true);
  api.advanceEnemy(enemy, player, 1 / 60, [{ x: 15, z: 86, halfX: 4, halfZ: 6 }], [player, enemy]);
  assert.ok(enemy.speed > 0, 'Opponents must navigate around cover instead of parking behind it');
});

test('all campaigns and seeded encounters spawn clear of the full city obstacles', () => {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
  const world = api.createWorld();
  delete globalThis.document;
  const game = new api.Game(new api.Scene(), world, { shot() {}, hit() {}, finish() {}, notify() {} });
  for (const mode of ['campaign', 'battle', 'survival']) for (let index = 0; index < 6; index++) {
    game.start(mode, index, 'standard', 735 + index);
    for (const actor of [game.player, ...game.enemies]) {
      const position = actor.visual.root.position;
      assert.ok(world.obstacles.every(obstacle => Math.abs(position.x - obstacle.x) >= obstacle.halfX + 2.3 ||
        Math.abs(position.z - obstacle.z) >= obstacle.halfZ + 2.3), `${mode} ${index} overlaps an obstacle`);
    }
  }
  game.garage();
});

test('real incoming fire ends an unattended campaign and retry restores clean state', () => {
  const game = fixture(); game.start('campaign', 0, 'veteran');
  for (let frame = 0; frame < 220 * 60 && game.phase === 'playing'; frame++) game.update(1 / 60, neutral);
  assert.equal(game.phase, 'defeat');
  assert.equal(game.player.hp, 0);
  game.start('campaign', 0, 'veteran');
  assert.equal(game.phase, 'playing'); assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.elapsed, 0); assert.equal(game.kills, 0); assert.equal(game.shots, 0);
  game.garage();
});
