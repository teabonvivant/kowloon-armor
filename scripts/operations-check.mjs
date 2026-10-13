import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
export { Game } from './src/game';
export { loadPreferences, savePreferences } from './src/preferences';
export { Scene, Group } from 'three';
export { Input } from './src/input';
export * from './src/operations';
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const idle = { throttle: 0, steer: 0, brake: true, aimX: 0, aimY: 0, fire: false, scope: false, toggleCamera: false, pause: false };
function game() { return new api.Game(new api.Scene(), { group: new api.Group(), obstacles: [] }, { shot(){}, hit(){}, finish(){}, notify(){} }); }

test('waypoint rejects obstacles and clears on arrival, not while paused', () => {
  const current = game(); current.start('drive', 0);
  assert.equal(typeof current.setWaypoint, 'function');
  current.world.obstacles.push({ x: 20, z: 20, halfX: 5, halfZ: 5 });
  assert.equal(current.setWaypoint(20, 20), false);
  assert.equal(current.setWaypoint(Infinity, 0), false);
  assert.equal(current.setWaypoint(240, 0), false);
  assert.equal(current.setWaypoint(0, 100), true);
  current.pause(); current.update(1, idle); assert.ok(current.waypoint);
  current.resume(); current.update(1 / 60, idle); assert.equal(current.waypoint, null);
});

test('new sortie resets log, waypoint and challenge without altering seeded spawns', () => {
  const current = game(); current.start('battle', 0, 'standard', 17);
  assert.ok(Array.isArray(current.journal));
  const spawns = current.enemies.map(enemy => [enemy.spec.id, enemy.visual.root.position.toArray()]);
  current.setWaypoint(0, 0); current.update(1 / 60, { ...idle, fire: true });
  assert.equal(current.journal.length, 1);
  current.start('battle', 0, 'standard', 17);
  assert.equal(current.waypoint, null); assert.equal(current.journal.length, 0);
  assert.deepEqual(current.enemies.map(enemy => [enemy.spec.id, enemy.visual.root.position.toArray()]), spawns);
});

test('comfort settings migrate independently and malformed values do not erase controls', () => {
  const data = new Map([['kowloon-armor-settings', JSON.stringify({ sensitivity: 1.7, chaseDistance: 999, favorites: ['bad-id'] })]]);
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const preferences = api.loadPreferences();
  assert.equal(preferences.chaseDistance, 15); assert.equal(preferences.sensitivity, 1.7);
  assert.deepEqual(preferences.favorites, []); assert.equal(preferences.effectsVolume, 1);
  assert.equal(api.savePreferences({ ...preferences, scopeSensitivity: .6, lowFlash: true }), true);
  assert.equal(api.loadPreferences().scopeSensitivity, .6); assert.equal(api.loadPreferences().lowFlash, true);
  delete globalThis.localStorage;
});

test('seed parser rejects coercion, overflow and decimals', () => {
  assert.equal(api.parseSeed(''), undefined); assert.equal(api.parseSeed('0'), 0);
  assert.equal(api.parseSeed('4294967295'), 4294967295);
  for (const value of ['-1', '1.5', '1e3', '4294967296', 'NaN']) assert.equal(api.parseSeed(value), null);
});

test('ballistic estimate uses game velocity and signed lateral motion', () => {
  const current = game(); current.start('battle', 0);
  const target = current.enemies[0]; target.speed = 10; target.yaw = -Math.PI / 2;
  const estimate = api.ballisticEstimate(195.5, current.player, target);
  assert.equal(estimate.seconds, 1); assert.equal(estimate.drop, .6); assert.ok(Math.abs(estimate.lead - 10) < .0001);
});

test('contracts require meaningful combat and do not grant armor awards on defeat', () => {
  const current = game(); current.start('battle', 0); current.challenge = 'armor';
  assert.equal(api.challengeStatus(current).complete, false);
  current.phase = 'defeat'; assert.equal(api.challengeStatus(current).complete, false);
  current.phase = 'victory'; assert.equal(api.challengeStatus(current).complete, true);
  current.challenge = 'precision'; current.shots = 5; current.hits = 3;
  assert.equal(api.challengeStatus(current).complete, false);
  current.shots = 6; current.hits = 5; assert.equal(api.challengeStatus(current).complete, true);
  current.challenge = 'mobile'; current.report.distance = 800; current.kills = 1;
  assert.equal(api.challengeStatus(current).complete, false);
  current.kills = 2; assert.equal(api.challengeStatus(current).complete, true);
  current.mode = 'survival'; current.phase = 'defeat'; assert.equal(api.challengeStatus(current).complete, true);
  current.challenge = 'armor'; assert.equal(api.challengeStatus(current).complete, false);
  current.mode = 'drive'; assert.equal(api.challengeStatus(current).complete, false);
});

test('frame statistics are bounded and pause samples are excluded', () => {
  const pair = new api.FrameDiagnostics(); pair.sample(.01, true); pair.sample(.03, true);
  assert.equal(pair.summary().median, 20);
  const frames = new api.FrameDiagnostics();
  for (let index = 0; index < 120; index++) frames.sample(.02, true);
  frames.sample(8, false);
  assert.equal(frames.summary().median, 20); assert.equal(frames.summary().p95, 20);
  for (let index = 0; index < 120; index++) frames.sample(.04, true);
  assert.equal(frames.summary().count, 120); assert.equal(frames.summary().median, 40);
});

test('report is a snapshot with explicit version and actionable coaching', () => {
  const current = game(); current.start('battle', 0, 'standard', 15);
  const report = api.operationReport(current);
  assert.equal(report.seed, 15); assert.equal(report.version, '1.6');
  current.report.dealt = 100; assert.equal(report.statistics.dealt, 0);
  assert.match(api.coaching(current), /開炮/);
  current.shots = 10; current.hits = 2; assert.match(api.coaching(current), /停車/);
});

test('battle journal retains only the most recent forty timestamped events', () => {
  const current = game(); current.start('drive', 0);
  for (let index = 0; index < 55; index++) { current.player.cooldown = 0; current.update(1 / 60, { ...idle, fire: true }); }
  assert.equal(current.journal.length, 40); assert.equal(current.shots, 55);
  assert.ok(current.journal[0].time > 15 / 60);
  assert.ok(current.journal.every(entry => entry.message === '主炮發射'));
});

test('scope sensitivity changes only scoped mouse displacement, not ordinary or observation input', () => {
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.window = new EventTarget();
  const element = new EventTarget(); element.tabIndex = 0; element.focus = () => {};
  globalThis.document = Object.assign(new EventTarget(), {body: {}, documentElement: {}, activeElement: element, pointerLockElement: element, hidden: false});
  const input = new api.Input(element, { sample: () => ({ ...idle, brake: false }), reset() {}, dispose() {} }); input.scopeSensitivity = .5;
  const move = () => window.dispatchEvent(Object.assign(new Event('pointermove'), {movementX:100, movementY:0}));
  const key = code => {
    const event = Object.assign(new Event('keydown'), {code, repeat:false}); Object.defineProperty(event, 'target', {value:element}); window.dispatchEvent(event);
  };
  try {
    move(); const normal = input.sample(1 / 60); key('ShiftLeft'); move(); const scoped = input.sample(1 / 60);
    key('KeyC'); move(); const observed = input.sample(1 / 60);
    assert.equal(scoped.scope, true); assert.equal(scoped.pointerX, normal.pointerX * .5);
    assert.equal(observed.observe, true); assert.equal(observed.pointerX, normal.pointerX);
  } finally { input.dispose(); globalThis.window = originalWindow; globalThis.document = originalDocument; delete globalThis.localStorage; }
});
