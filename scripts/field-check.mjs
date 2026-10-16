import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export { Game } from './src/game';
  export { createActor } from './src/actors';
  export { TANKS } from './src/data/tanks';
  export { Scene, Group, Vector3 } from 'three';
  export { loadPreferences, savePreferences } from './src/preferences';
  export { AdaptiveResolution } from './src/resolution';
  export { TOUR_STOPS, navigationHint } from './src/field';
  export { createWorld } from './src/render/world';
  export { blocked } from './src/math';
  export { roadWaypoint } from './src/tactics';
  export { angleDelta, clamp } from './src/math';
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const idle = { throttle: 0, steer: 0, brake: false, aimX: 0, aimY: 0, fire: false, scope: false, toggleCamera: false, pause: false };
function game() { return new api.Game(new api.Scene(), { group: new api.Group(), obstacles: [] }, { shot(){}, hit(){}, finish(){}, notify(){} }); }

test('fire solution picks nearest hull along the barrel, respects pitch and walls', () => {
  const current = game(); current.start('drive', 0);
  const far = api.createActor(api.TANKS[0], 0, 20, true), near = api.createActor(api.TANKS[0], 0, 60, true);
  current.enemies.push(far, near);
  assert.equal(current.target, near);
  current.player.pitch = .32; assert.equal(current.target, undefined);
  current.player.pitch = 0; current.world.obstacles.push({ x: 0, z: 98, halfX: 5, halfZ: 1 });
  assert.equal(current.target, undefined); assert.equal(current.fireSolution.blocked, true);
});

test('threat alert requires line of sight, aim and imminent reload', () => {
  const current = game(); current.start('drive', 0);
  const enemy = api.createActor(api.TANKS[0], 0, 60, true); current.enemies.push(enemy);
  enemy.cooldown = .5; assert.equal(current.threats, 1);
  enemy.cooldown = 3; assert.equal(current.threats, 0);
  enemy.cooldown = 0; enemy.aim = 0; assert.equal(current.threats, 0);
  enemy.aim = Math.PI; current.world.obstacles.push({ x: 0, z: 80, halfX: 5, halfZ: 1 });
  assert.equal(current.threats, 0);
});

test('tour is optional, requires stopping and resets on a new sortie', () => {
  const current = game(); current.start('drive', 0);
  assert.equal(current.tour.active, false);
  assert.equal(current.toggleTour(), true);
  const stop = current.tour.destination;
  current.player.visual.root.position.set(stop.x, 0, stop.z);
  for (let step = 0; step < 110; step++) current.update(1 / 60, idle);
  assert.equal(current.tour.visited.size, 0);
  current.pause(); current.update(10, idle); assert.equal(current.tour.visited.size, 0); current.resume();
  for (let step = 0; step < 20; step++) current.update(1 / 60, idle);
  assert.equal(current.tour.visited.size, 1);
  for (let step = 0; step < 180; step++) current.update(1 / 60, idle);
  assert.equal(current.tour.visited.size, 1);
  current.start('battle', 0); assert.equal(current.tour.visited.size, 0); assert.equal(current.toggleTour(), false);
});

test('debrief counts actual damage and movement, resets between rounds', () => {
  const current = game(); current.start('drive', 0);
  for (let step = 0; step < 60; step++) current.update(1 / 60, { ...idle, throttle: 1 });
  assert.ok(current.report.distance > 2);
  const enemy = api.createActor(api.TANKS[0], 0, current.player.visual.root.position.z - 30, true);
  enemy.hp = 1; current.enemies.push(enemy);
  current.update(1 / 60, { ...idle, fire: true });
  for (let step = 0; step < 30; step++) current.update(1 / 60, idle);
  assert.equal(current.report.dealt, 1);
  current.start('drive', 0); assert.deepEqual(current.report, { dealt: 0, received: 0, flankingHits: 0, distance: 0 });
});

test('new presentation options migrate and persist without replacing old controls', () => {
  const data = new Map([['kowloon-armor-settings', JSON.stringify({ sensitivity: 1.7 })]]);
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const preferences = api.loadPreferences();
  assert.equal(preferences.lighting, 'dusk'); assert.equal(preferences.adaptiveResolution, false); // v1.9 C08: new installs default to dusk
  assert.equal(preferences.nightAudio, false); assert.equal(preferences.highContrast, false);
  assert.equal(api.savePreferences({ ...preferences, lighting: 'dusk', adaptiveResolution: true, nightAudio: true, highContrast: true }), true);
  assert.equal(api.loadPreferences().lighting, 'dusk'); assert.equal(api.loadPreferences().sensitivity, 1.7);
  delete globalThis.localStorage;
});

test('adaptive resolution ignores isolated spikes and recovers more slowly than it falls', () => {
  const resolution = new api.AdaptiveResolution();
  resolution.sample(.1); for (let step = 0; step < 120; step++) resolution.sample(1 / 60);
  assert.equal(resolution.scale, 1);
  for (let step = 0; step < 61; step++) resolution.sample(1 / 30);
  assert.equal(resolution.scale, .9);
  for (let step = 0; step < 1000; step++) resolution.sample(1 / 30);
  assert.equal(resolution.scale, .6);
  resolution.sample(8); assert.equal(resolution.scale, .6);
  for (let step = 0; step < 300; step++) resolution.sample(1 / 60);
  assert.equal(resolution.scale, .6);
  for (let step = 0; step < 70; step++) resolution.sample(1 / 60);
  assert.equal(resolution.scale, .7);
  resolution.reset(); assert.equal(resolution.scale, 1);
});

test('all six tour stops are on clear roads and a movement-input pilot can visit every stop', () => {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  const world = api.createWorld(); delete globalThis.document;
  const current = new api.Game(new api.Scene(), world, { shot(){}, hit(){}, finish(){}, notify(){} });
  current.start('drive', 0); current.toggleTour();
  for (const stop of api.TOUR_STOPS) assert.equal(api.blocked(stop.x, stop.z, world.obstacles), false);
  for (let step = 0; step < 1200 * 60 && current.tour.visited.size < 6; step++) {
    const stop = current.tour.destination, position = current.player.visual.root.position;
    const near = Math.hypot(stop.x - position.x, stop.z - position.z) < 8;
    const waypoint = api.roadWaypoint(position, new api.Vector3(stop.x, 0, stop.z), world.obstacles);
    const turn = api.angleDelta(current.player.yaw, Math.atan2(-(waypoint.x - position.x), -(waypoint.z - position.z)));
    const throttle = !near && Math.abs(turn) < .4 ? .65 : 0;
    current.update(1 / 60, { ...idle, throttle, brake: !throttle, steer: near ? 0 : api.clamp(-turn * 2.5, -1, 1) });
    assert.equal(api.blocked(position.x, position.z, world.obstacles), false);
  }
  assert.equal(current.tour.visited.size, 6);
  assert.equal(current.tour.destination, undefined);
});

test('navigation describes relative left and right without rotating the tank', () => {
  const current = game();
  assert.match(api.navigationHint(current.player, 50, 100), /右 90°/);
  assert.match(api.navigationHint(current.player, -50, 100), /左 90°/);
  assert.match(api.navigationHint(current.player, 0, 150), /後方/);
});

test('track repair status pauses with throttle and resumes when stationary', () => {
  const current = game(); current.start('drive', 0); current.player.leftTrack = 6;
  current.update(1 / 60, { ...idle, throttle: 1 });
  assert.equal(current.repairingTracks, false); assert.equal(current.player.leftTrack, 6);
  for (let step = 0; step < 60; step++) current.update(1 / 60, { ...idle, brake: true });
  assert.equal(current.repairingTracks, true); assert.ok(current.player.leftTrack < 5.1);
});

test('received damage equals actual health loss from enemy fire', () => {
  const current = game(); current.start('drive', 0);
  const enemy = api.createActor(api.TANKS[0], 0, 60, true); enemy.cooldown = 0; current.enemies.push(enemy);
  for (let step = 0; step < 360; step++) current.update(1 / 60, idle);
  assert.ok(current.report.received > 0);
  assert.equal(current.report.received, current.player.maxHp - current.player.hp);
  assert.equal(current.report.dealt, 0);
});
