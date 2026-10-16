import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export { Game } from './src/game';
  export { createActor } from './src/actors';
  export { TANKS } from './src/data/tanks';
  export { Scene, Group, Vector3 } from 'three';
  export { comboMultiplier } from './src/arcade';
` }, bundle: true, format: 'esm', platform: 'node', write: false, define: { __REALISM_SAMPLE__: 'false' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const idle = { throttle: 0, steer: 0, brake: false, aimX: 0, aimY: 0, fire: false, scope: false, toggleCamera: false, pause: false };
function make() {
  const popups = [], hits = [];
  const game = new api.Game(new api.Scene(), { group: new api.Group(), obstacles: [] },
    { shot() {}, hit: (d, k, e) => hits.push({ d, k, e }), finish() {}, notify() {}, popup: (t, k) => popups.push({ t, k }) });
  game.start('drive', 0, 'standard', 7);
  game.enemies.length = 0; game.arcade.clear();
  return { game, popups, hits };
}
const run = (game, seconds) => { for (let i = 0; i < seconds * 60; i++) game.update(1 / 60, idle); };

test('barrel blast damages enemies in radius by distance, spares those outside', () => {
  const { game } = make();
  const near = api.createActor(api.TANKS[0], 0, 10, true), far = api.createActor(api.TANKS[0], 60, 10, true);
  game.enemies.push(near, far); game.arcade.populate(1, game.player.visual.root.position, [], 0, 0);
  const prop = { id: 99, kind: 'barrel', x: 3, z: 10, radius: 1.05, height: 3.4, alive: true, root: new api.Group() };
  game.arcade.props.push(prop);
  const before = near.hp, farBefore = far.hp;
  game.blastProp(prop, true);
  assert.ok(near.hp < before, 'enemy within 11 m takes damage');
  assert.equal(far.hp, farBefore, 'enemy 57 m away is untouched');
  assert.equal(prop.alive, false);
});

test('chain: a blast sets off neighbouring props after a short delay', () => {
  const { game } = make();
  const mk = (id, x) => ({ id, kind: 'barrel', x, z: 40, radius: 1.05, height: 3.4, alive: true, root: new api.Group() });
  const a = mk(1, 0), b = mk(2, 5), c = mk(3, 60);
  game.arcade.props.push(a, b, c);
  game.blastProp(a, true);
  assert.equal(b.alive, true, 'neighbour is delayed, not instant');
  run(game, 1);
  assert.equal(b.alive, false); assert.equal(c.alive, true);
});

test('kills inside the window multiply, timeout resets, cap at x6', () => {
  const { game } = make();
  const first = game.arcade.kill(100), second = game.arcade.kill(100);
  assert.equal(first.points, 100); assert.equal(second.points, 200);
  for (let i = 0; i < 10; i++) game.arcade.kill(100);
  assert.equal(api.comboMultiplier(game.arcade.combo), 6);
  run(game, 5.5); assert.equal(game.arcade.combo, 0);
  assert.equal(game.arcade.kill(100).points, 100);
});

test('repair pickup heals and clears tracks; expires if ignored', () => {
  const { game, popups } = make();
  game.player.hp = game.player.maxHp * .4; game.player.leftTrack = 5;
  const p = game.player.visual.root.position;
  game.arcade.dropPickup('repair', p.x + 1, p.z);
  run(game, .1);
  assert.ok(game.player.hp > game.player.maxHp * .65 && game.player.hp < game.player.maxHp * .75);
  assert.equal(game.player.leftTrack, 0); assert.ok(popups.some(x => x.k === 'pickup'));
  game.arcade.dropPickup('rapid', p.x + 80, p.z); run(game, 23); assert.equal(game.arcade.pickups.length, 0);
});

test('airstrike has a delay, hurts enemies not the player, then cools down', () => {
  const { game } = make();
  const e = api.createActor(api.TANKS[0], 0, 100 - 40, true); e.hp = e.maxHp = 400; game.enemies.push(e);
  game.player.aim = 0; game.player.yaw = 0;
  const playerHp = game.player.hp;
  assert.equal(game.callStrike(), true);
  assert.equal(game.callStrike(), false, 'cooldown blocks a second call');
  run(game, 1); assert.equal(e.hp, 400, 'no damage before shells land');
  run(game, 4); assert.ok(e.hp < 400, 'barrage damages the enemy');
  assert.equal(game.player.hp, playerHp);
  run(game, 32); assert.equal(game.callStrike(), true);
});

test('prop kills add score and reset with a new sortie', () => {
  const { game } = make();
  const score = game.score;
  const prop = { id: 5, kind: 'car', x: 30, z: 30, radius: 2.3, height: 2, alive: true, root: new api.Group() };
  game.arcade.props.push(prop); game.blastProp(prop, true);
  assert.ok(game.score > score);
  game.start('drive', 0, 'standard', 7); assert.equal(game.arcade.bonus, 0);
  assert.ok(game.arcade.props.length > 0, 'a sortie scatters explosive props');
});

test('a real shell flying into a barrel detonates it and an enemy beside it is hurt', () => {
  const { game } = make();
  const p = game.player.visual.root.position;
  game.player.aim = 0; game.player.yaw = 0;
  const prop = { id: 8, kind: 'barrel', x: p.x, z: p.z - 40, radius: 1.05, height: 3.4, alive: true, root: new api.Group() };
  game.arcade.props.push(prop);
  const enemy = api.createActor(api.TANKS[0], p.x + 4, p.z - 41, true); enemy.cooldown = 99; game.enemies.push(enemy);
  const hp = enemy.hp;
  game.update(1 / 60, { ...idle, fire: true }); run(game, 2);
  assert.equal(prop.alive, false, 'shell struck the barrel');
  assert.ok(enemy.hp < hp, 'blast hurt the neighbour');
});
