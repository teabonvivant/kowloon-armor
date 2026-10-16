import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export * from './src/actors'; export * from './src/render/tank'; export * from './src/combat';
  export * from './src/operations'; export * from './src/field'; export * from './src/effects';
  export { Game } from './src/game'; export { TANKS } from './src/data/tanks';
  export { SimulationClock } from './src/simulation-clock';
  export { PROGRESS_KEY, saveProgress, readProgress } from './src/persistence';
  export { hudMarkup } from './src/hud'; export { tacticalMarkup } from './src/operations-ui';
  export { Scene, Group, Vector3, Quaternion } from 'three';
  ${existsSync('src/ballistics.ts') ? "export * from './src/ballistics';" : ''}
` }, define: { __REALISM_SAMPLE__: 'true' }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const vector = (x = 0, y = 0, z = 0) => new api.Vector3(x, y, z);
const neutral = { throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false, brake: true, scope: false, toggleCamera: false, pause: false };
const actor = (x = 0, z = 0, enemy = false) => api.createActor(api.TANKS[0], x, z, enemy);
function setup() {
  const scene = new api.Scene(), effects = new api.Effects(scene), contacts = [], hits = [], shots = [];
  const combat = new api.Combat(scene, effects, { shot() {}, cannon: position => shots.push(position.clone()), contact: contact => contacts.push(contact), hit: (...args) => hits.push(args) });
  return { scene, effects, combat, contacts, hits, shots };
}

test('sample profile names the verified L55/DM63A1 pairing; other vehicles retain declared game profiles', () => {
  assert.equal(typeof api.weaponProfile, 'function', 'weaponProfile must exist');
  const profile = api.weaponProfile(api.TANKS[0]);
  assert.equal(profile.velocity, 1720); assert.equal(profile.gravity, 9.81);
  assert.match(profile.provenance, /rheinmetall/i); assert.match(profile.id, /DM63A1/);
  assert.equal(api.weaponProfile(api.TANKS[1]).provenance, 'game-balanced');
});

test('physics and effect originate at the exact rendered muzzle, including scale and elevated side shots', () => {
  assert.equal(typeof api.launchPose, 'function', 'launchPose must exist');
  for (const yaw of [0, .7]) for (const aim of [0, Math.PI / 2, .8]) for (const pitch of [-.12, .25]) {
    const tank = actor(12, 84); tank.yaw = yaw; tank.aim = aim; tank.pitch = pitch;
    tank.visual.root.scale.set(1, 1, 1.13);
    api.moveActor(tank, 0, 0, true, 0, [], [tank]);
    const pose = api.launchPose(tank), expected = api.muzzlePosition(tank.visual, vector());
    assert.ok(pose.origin.distanceTo(expected) < 1e-8);
    const expectedDirection = vector(-Math.sin(aim) * Math.cos(pitch), Math.sin(pitch), -Math.cos(aim) * Math.cos(pitch));
    assert.ok(pose.direction.distanceTo(expectedDirection) < 1e-8, 'non-uniform scale must not change aim');
    const boreAxis = tank.visual.barrel.localToWorld(vector(0, 0, -1)).sub(tank.visual.barrel.localToWorld(vector())).normalize();
    assert.ok(pose.direction.distanceTo(boreAxis) < 1e-8, 'two rendered bore points must agree with the physics axis');
    const probe = setup(); probe.combat.fire(tank, []);
    assert.ok(probe.shots[0].distanceTo(expected) < 1e-8);
    const shell = probe.combat.projectileSnapshot()[0];
    assert.ok(vector(...shell.position).distanceTo(expected) < 1e-8);
    assert.ok(Math.abs(vector(...shell.velocity).length() - 1720) < 1e-6);
    probe.combat.dispose(); probe.effects.dispose();
  }
});

test('a depressed shot hits the ground before a wall in the same fast sweep', () => {
  const probe = setup(), tank = actor(); tank.pitch = -.12;
  const wall = [{ x: 0, z: -30, halfX: 10, halfZ: 1 }];
  probe.combat.fire(tank, wall); probe.combat.update(1 / 30, [tank], wall, 1);
  assert.equal(probe.contacts.length, 1); assert.equal(probe.contacts[0].kind, 'road');
  assert.ok(Math.abs(probe.contacts[0].position.y - .2) < 1e-6);
  probe.combat.dispose(); probe.effects.dispose();
});

test('near muzzle obstruction prevents tunnelling and distant thin walls catch high speed shots', () => {
  for (const distance of [4, 20, 180]) {
    const probe = setup(), tank = actor(), wall = [{ x: 0, z: -distance, halfX: 4, halfZ: .05 }];
    probe.combat.fire(tank, wall);
    for (let tick = 0; tick < 20; tick++) probe.combat.update(1 / 60, [tank], wall, 1);
    assert.equal(probe.contacts.length, 1, `wall ${distance} m`);
    assert.equal(probe.contacts[0].kind, 'building');
    assert.ok(Math.abs(probe.contacts[0].position.z + distance - .05) < 1e-5);
    probe.combat.dispose(); probe.effects.dispose();
  }
});

test('barrel tube recoils within the fixed elevated cradle and returns exactly to battery', () => {
  for (const pitch of [-.12, 0, .28]) {
    const tank = actor(); tank.visual.barrel.rotation.x = pitch;
    assert.ok(tank.visual.recoilTube, 'a separate recoilTube is required');
    const cradle = tank.visual.barrel.position.clone(), tube = tank.visual.recoilTube.position.clone();
    api.kickTank(tank.visual, 120, 67, 0);
    api.updateTankMotion(tank.visual, .045, pitch, 0, false);
    assert.deepEqual(tank.visual.barrel.position, cradle);
    assert.equal(tank.visual.recoilTube.position.x, tube.x); assert.equal(tank.visual.recoilTube.position.y, tube.y);
    assert.ok(tank.visual.recoilTube.position.z > tube.z + .25);
    api.updateTankMotion(tank.visual, 1, pitch, 0, false);
    assert.deepEqual(tank.visual.recoilTube.position, tube);
  }
});

test('the shot preserves driving pitch; suspension initially raises the forward nose and rolls away from side recoil', () => {
  const tank = actor(); api.updateTankMotion(tank.visual, .2, 0, 4, false);
  const previous = tank.visual.body.rotation.x;
  api.kickTank(tank.visual, 120, 67, 0);
  assert.equal(tank.visual.body.rotation.x, previous, 'firing must not clear existing suspension');
  api.updateTankMotion(tank.visual, .04, 0, 4, false);
  assert.ok(tank.visual.body.rotation.x > previous, 'forward firing must lift the nose initially');
  const side = actor(); api.kickTank(side.visual, 120, 67, Math.PI / 2);
  api.updateTankMotion(side.visual, .04, 0, 0, false);
  assert.ok(side.visual.body.rotation.z < 0, 'firing left loads the right suspension');
  api.updateTankMotion(side.visual, .1, 0, 0, true);
  assert.equal(side.visual.body.rotation.x, 0); assert.equal(side.visual.body.rotation.z, 0);
});

test('HUD uses the same muzzle range and gravity as physical flight', () => {
  assert.equal(typeof api.weaponProfile, 'function');
  const player = actor(), target = actor(0, -100, true); target.yaw = Math.PI / 2; target.speed = 10;
  const result = api.ballisticEstimate(100, player, target);
  const expectedSeconds = (100 - api.muzzlePosition(player.visual, vector()).length()) / 1720;
  assert.ok(Math.abs(result.seconds - expectedSeconds) < .002);
  assert.ok(Math.abs(result.drop - .5 * 9.81 * result.seconds ** 2) < 1e-8);
  assert.ok(Math.abs(Math.abs(result.lead) - result.seconds * 10) < 1e-8);
});

test('moving target is hit through the lead solver at 30, 60 and 144 Hz presentation schedules', () => {
  assert.equal(typeof api.intercept, 'function', 'intercept must exist');
  const results = [];
  for (const refresh of [30, 60, 144]) {
    const probe = setup(), player = actor(), target = actor(0, -160, true), clock = new api.SimulationClock();
    target.yaw = -Math.PI / 2; target.speed = 12;
    const solution = api.intercept(player, target); player.aim = solution.aim; player.pitch = solution.pitch;
    api.moveActor(player, 0, 0, true, 0, [], [player, target]); probe.combat.fire(player, []);
    for (let frame = 0; frame < refresh / 2; frame++) clock.advance(1 / refresh, step => {
      target.visual.root.position.x += target.speed * step; probe.combat.update(step, [player, target], [], 1); return true;
    });
    assert.equal(probe.hits.length, 1); results.push(target.hp);
    probe.combat.dispose(); probe.effects.dispose();
  }
  assert.deepEqual(results, [results[0], results[0], results[0]]);
});

test('sample runs an input-only complete encounter and an unattended defeat without altering HP or cooldown', () => {
  assert.equal(typeof api.intercept, 'function');
  const world = { group: new api.Group(), obstacles: [], size: 460 }, scene = new api.Scene();
  const game = new api.Game(scene, world, { shot() {}, hit() {}, finish() {}, notify() {} });
  game.start('battle', 0, 'standard', 71439);
  assert.equal(game.totalEnemies, 2, 'the sample encounter is two configured opponents');
  for (let tick = 0; tick < 90 * 60 && game.phase === 'playing'; tick++) {
    const target = game.enemies.find(enemy => enemy.alive);
    const solution = api.intercept(game.player, target);
    const aimError = Math.atan2(Math.sin(solution.aim - game.player.aim), Math.cos(solution.aim - game.player.aim));
    game.update(1 / 60, { ...neutral, pointerX: -aimError, pointerY: solution.pitch - game.player.pitch, fire: true });
  }
  assert.equal(game.phase, 'victory'); assert.equal(game.kills, 2); assert.ok(game.shots >= 4);
  game.start('battle', 0, 'standard', 71439);
  for (let tick = 0; tick < 300 * 60 && game.phase === 'playing'; tick++) game.update(1 / 60, neutral);
  assert.equal(game.phase, 'defeat'); game.dispose();
});

test('a tank between the breech and muzzle receives the first contact even when a wall is beyond it', () => {
  const probe = setup(), player = actor(), target = actor(0,-4.75,true);
  target.yaw = target.aim = Math.PI / 2;
  const wall = [{ x: 0,z: -6,halfX: 5,halfZ: .05 }];
  probe.combat.fire(player,wall); probe.combat.update(1 / 60,[player,target],wall,1);
  assert.equal(probe.hits.length,1); assert.equal(probe.contacts[0].kind,'armor');
  assert.ok(target.hp < target.maxHp); probe.combat.dispose(); probe.effects.dispose();
});

test('lead is solved in the local gun frame while accelerating or braking', () => {
  for (const acceleration of [-26,-6,6]) for (const bearing of [0,.7,Math.PI / 2]) {
    const probe = setup(), player = actor(), target = actor(-Math.sin(bearing) * 180,-Math.cos(bearing) * 180,true);
    api.updateTankMotion(player.visual,.5,0,acceleration,false);
    const solution = api.intercept(player,target); player.aim = solution.aim; player.pitch = solution.pitch;
    probe.combat.fire(player,[]);
    for (let tick = 0; tick < 20; tick++) probe.combat.update(1 / 60,[player,target],[],1);
    assert.equal(probe.hits.length,1,`acceleration ${acceleration} bearing ${bearing}`);
    probe.combat.dispose(); probe.effects.dispose();
  }
});

test('sample progress and recovery writes never touch the main game keys', () => {
  const values = new Map([['kowloon-armor-progress','keep-main'],['kowloon-armor-progress-recovery','keep-recovery']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null,setItem: (key,value) => values.set(key,value) };
  assert.notEqual(api.PROGRESS_KEY,'kowloon-armor-progress');
  assert.ok(api.saveProgress({ completed: 0,victories: 0,bestScores: {},trainingComplete: true }));
  assert.equal(values.get('kowloon-armor-progress'),'keep-main'); assert.equal(values.get('kowloon-armor-progress-recovery'),'keep-recovery');
  delete globalThis.localStorage;
});

test('a shell clears a low road barrier but hits its taller equivalent', () => {
  for (const height of [.94,3]) {
    const probe = setup(), player = actor(), target = actor(0,-60,true), wall = [{ x: 0,z: -20,halfX: 5,halfZ: .5,height }];
    probe.combat.fire(player,wall);
    for (let tick = 0; tick < 10; tick++) probe.combat.update(1 / 60,[player,target],wall,1);
    assert.equal(probe.contacts[0].kind,height < 1 ? 'armor' : 'building');
    probe.combat.dispose(); probe.effects.dispose();
  }
});

test('sample navigation presents its street rather than absent full-city landmarks', () => {
  const game = new api.Game(new api.Scene(),{ group: new api.Group(),obstacles: [{ x: 16,z: 50,halfX: 4,halfZ: 9 }] },{ shot() {},hit() {},finish() {},notify() {} });
  game.start('drive',0);
  const hud = api.hudMarkup(game), map = api.tacticalMarkup(game);
  assert.doesNotMatch(hud,/tour-toggle|探索九龍街道/);
  assert.doesNotMatch(map,/data-waypoint=|尖沙咀|油麻地|廟街|西九/);
  assert.match(map,/街口樣板/); assert.match(map,/x="232" y="261" width="8" height="18"/);
  assert.match(map,/id="map-waypoint"/); game.dispose();
});
