import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const optionalModules = ['simulation-clock', 'armor', 'tactics', 'objectives', 'key-bindings', 'spatial-audio'];
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export * from './src/actors.ts';
  export * from './src/combat.ts';
  export * from './src/effects.ts';
  export * from './src/game.ts';
  export * from './src/input-keys.ts';
  export * from './src/preferences.ts';
  export * from './src/data/missions.ts';
  export * from './src/data/tanks.ts';
  export { createTank, rotateWheels, disposeTank } from './src/render/tank.ts';
  export { Scene, Group, Vector3, Matrix4 } from 'three';
  ${optionalModules.filter(name => existsSync(`src/${name}.ts`)).map(name => `export * from './src/${name}.ts';`).join('\n')}
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const neutral = { throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false, brake: false, scope: false, toggleCamera: false, pause: false };
const fixture = (obstacles = []) => new api.Game(new api.Scene(), { group: new api.Group(), obstacles, size: 460 }, {
  shot() {}, hit() {}, finish() {}, notify() {},
});
const advance = (game, seconds, input = neutral) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, input);
};

test('an in-flight shell keeps identical damage when its shooter turns away', () => {
  const shot = turn => {
    const scene = new api.Scene(), effects = new api.Effects(scene);
    const source = api.createActor(api.TANKS[0], 0, 0);
    const target = api.createActor(api.TANKS[1], 0, -40, true);
    const hits = [];
    const combat = new api.Combat(scene, effects, { shot() {}, hit: (damage, killed, enemy, detail) => hits.push({ damage, detail }) });
    combat.fire(source, []);
    source.aim = turn;
    for (let frame = 0; frame < 30; frame++) combat.update(1 / 60, [source, target], [], 1);
    combat.clear(); effects.clear();
    assert.equal(hits.length, 1);
    return hits[0].damage;
  };
  assert.equal(shot(0), shot(Math.PI), 'Turret changes after firing must not change impact damage');
});

function localFixture() {
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  globalThis.window = new EventTarget();
  const element = new EventTarget(); element.tabIndex = 0; element.focus = () => {};
  globalThis.document = Object.assign(new EventTarget(), { body: { classList: { contains: () => true } }, documentElement: {}, activeElement: element, pointerLockElement: element });
  const local = new api.LocalControls(element);
  return { local, pointer(pixels) {
    const event = Object.assign(new Event('pointermove'), { movementX: pixels, movementY: 0 });
    window.dispatchEvent(event);
  }, cleanup() { local.dispose(); globalThis.window = originalWindow; globalThis.document = originalDocument; } };
}

test('30, 60 and 144 Hz render schedules consume every mouse pixel exactly once', () => {
  assert.equal(typeof api.SimulationClock, 'function', 'Fixed-step input consumption must be testable');
  const run = rate => {
    const controls = localFixture(), clock = new api.SimulationClock();
    const game = fixture(); game.start('drive', 0);
    let steps = 0;
    for (let frame = 0; frame < rate; frame++) {
      controls.pointer(240 / rate);
      clock.advance(1 / rate, step => { steps++; game.update(step, controls.local.sample(step)); return true; });
    }
    const aim = game.player.aim;
    controls.cleanup(); game.garage();
    assert.equal(steps, 60);
    assert.ok(Math.abs(aim) > .2, 'The full drag must rotate the turret');
    return aim;
  };
  const expected = run(60);
  assert.ok(Math.abs(run(30) - expected) < 1e-8);
  assert.ok(Math.abs(run(144) - expected) < 1e-8);
});

test('large pointer displacement is not clipped to a keyboard axis', () => {
  const controls = localFixture();
  controls.pointer(200); const single = controls.local.sample(1 / 60);
  assert.ok(Math.abs(single.pointerX) > .2);
  assert.equal(controls.local.sample(1 / 60).pointerX, 0);
  controls.cleanup();
});

test('continuous component hits distinguish turret, hull and both tracks, including rotated tanks', () => {
  assert.equal(typeof api.intersectTank, 'function');
  const actor = api.createActor(api.TANKS[0], 0, 0);
  const hit = (start, delta) => api.intersectTank(actor, new api.Vector3(...start), new api.Vector3(...delta));
  assert.equal(hit([0, 2.5, -30], [0, 0, 60]).zone, 'turret');
  assert.equal(hit([0, 1.6, -30], [0, 0, 60]).zone, 'hull');
  assert.equal(hit([-1.85, .6, -30], [0, 0, 60]).zone, 'leftTrack');
  assert.equal(hit([1.85, .6, -30], [0, 0, 60]).zone, 'rightTrack');
  assert.equal(hit([0, 5, -30], [0, 0, 60]), null);
  actor.yaw = Math.PI / 2; actor.aim = Math.PI / 2;
  assert.equal(hit([-30, .6, 1.85], [60, 0, 0]).zone, 'leftTrack');
});

test('track damage limits mobility and only stationary time repairs it', () => {
  const game = fixture(); game.start('drive', 0);
  game.player.leftTrack = 6;
  advance(game, 3, { ...neutral, throttle: 1 });
  assert.equal(game.player.leftTrack, 6);
  assert.ok(game.player.speed < 6);
  advance(game, 2, { ...neutral, brake: true });
  assert.ok(game.player.leftTrack > 0 && game.player.leftTrack < 6);
  advance(game, 6, { ...neutral, brake: true });
  assert.equal(game.player.leftTrack, 0);
  advance(game, 4, { ...neutral, throttle: 1 });
  assert.ok(game.player.speed > 10);
  game.garage();
});

test('lighter vehicles accelerate and pivot faster without changing catalogue statistics', () => {
  const travel = id => {
    const game = fixture(); game.select(api.TANKS.find(tank => tank.id === id)); game.start('drive', 0);
    advance(game, 1, { ...neutral, throttle: 1, steer: .3 });
    const result = { speed: game.player.speed, yaw: Math.abs(game.player.yaw) }; game.garage(); return result;
  };
  const light = travel('type10'), heavy = travel('abrams');
  assert.ok(light.speed > heavy.speed * 1.1);
  assert.ok(light.yaw > heavy.yaw * 1.1);
});

test('capture requires uncontested presence and kills alone cannot complete it', () => {
  const game = fixture(); game.start('campaign', 1);
  assert.equal(game.mission.objective.kind, 'capture');
  for (const enemy of game.enemies) enemy.alive = false;
  game.kills = game.totalEnemies;
  advance(game, 2);
  assert.equal(game.phase, 'playing'); assert.equal(game.objective.progress, 0);
  const goal = game.mission.objective;
  game.player.visual.root.position.set(...[goal.center[0], 0, goal.center[1]]);
  advance(game, goal.seconds / 2);
  assert.ok(game.objective.progress > 0 && game.phase === 'playing');
  game.pause(); const progress = game.objective.progress; advance(game, 5);
  assert.equal(game.objective.progress, progress);
  game.resume(); advance(game, goal.seconds);
  assert.equal(game.phase, 'victory');
  game.garage();
});

test('contested capture freezes progress; defence falls to an occupied zone', () => {
  assert.equal(typeof api.updateObjective, 'function');
  const player = api.createActor(api.TANKS[0], 0, 0);
  const enemy = api.createActor(api.TANKS[1], 0, 10, true);
  const goal = { kind: 'capture', center: [0, 0], radius: 24, seconds: 20 };
  const state = api.createObjectiveState();
  api.updateObjective(state, goal, player, [enemy], 5);
  assert.equal(state.progress, 0); assert.equal(state.contested, true);
  enemy.alive = false;
  api.updateObjective(state, goal, player, [enemy], 5);
  assert.equal(state.progress, 5);
  player.visual.root.position.set(80, 0, 0); enemy.alive = true;
  const defence = api.createObjectiveState();
  api.updateObjective(defence, { ...goal, kind: 'defend' }, player, [enemy], 15);
  assert.equal(defence.integrity, 0);
  assert.equal(defence.progress, 0);
});

test('defence requires its full hold duration and retry resets a breached objective', () => {
  const game = fixture(); game.start('campaign', 3);
  assert.equal(game.mission.objective.kind, 'defend');
  const goal = game.mission.objective;
  game.player.visual.root.position.set(goal.center[0], 0, goal.center[1]);
  for (const enemy of game.enemies) enemy.alive = false;
  game.kills = game.totalEnemies;
  advance(game, 1); assert.equal(game.phase, 'playing');
  advance(game, goal.seconds); assert.equal(game.phase, 'victory');
  game.start('campaign', 3); game.objective.integrity = 0;
  game.update(1 / 60, neutral); assert.equal(game.phase, 'defeat');
  game.start('campaign', 3); assert.equal(game.objective.integrity, 100); assert.equal(game.objective.progress, 0);
  game.elapsed = game.mission.timeLimit; game.update(1 / 60, neutral); assert.equal(game.phase, 'defeat');
  game.garage();
});

test('survival repair restores hull and both tracks exactly once', () => {
  const game = fixture(); game.start('survival', 0, 'standard', 77);
  assert.equal(typeof game.chooseSupply, 'function');
  assert.equal(game.chooseSupply('repair'), false);
  game.player.hp = 100; game.player.leftTrack = 6; game.player.rightTrack = 6;
  for (const enemy of game.enemies) enemy.alive = false;
  game.update(1 / 60, neutral); assert.equal(game.chooseSupply('repair'), true);
  advance(game, 8.1);
  assert.equal(game.wave, 2);
  assert.equal(game.player.hp, 100 + Math.round(game.player.maxHp * .35));
  assert.equal(game.player.leftTrack, 0); assert.equal(game.player.rightTrack, 0);
  assert.equal(game.chooseSupply('reload'), false);
  game.garage();
});

test('survival ammunition accelerates exactly four reloads without repairing hull', () => {
  const game = fixture(); game.start('survival', 0, 'standard', 77);
  assert.equal(typeof game.chooseSupply, 'function');
  game.player.hp = 100;
  for (const enemy of game.enemies) enemy.alive = false;
  game.update(1 / 60, neutral); game.chooseSupply('reload'); advance(game, 8.01);
  assert.equal(game.player.hp, 100); assert.equal(game.player.rapidShots, 4);
  const combat = new api.Combat(new api.Scene(), new api.Effects(new api.Scene()), { shot() {}, hit() {} });
  for (let shot = 0; shot < 5; shot++) {
    game.player.cooldown = 0; assert.equal(combat.fire(game.player, []), true);
    assert.ok(Math.abs(game.player.cooldown - game.player.spec.reload * (shot < 4 ? .68 : 1)) < 1e-8);
  }
  assert.equal(game.player.rapidShots, 0); combat.clear(); game.garage();
  game.start('survival', 0, 'standard', 77);
  assert.equal(game.player.rapidShots, 0); assert.equal(game.intermission, 0); assert.equal(game.supply, 'repair');
  game.garage();
});

test('tactics assign opposite flanks, use cover while reloading and withdraw at low health', () => {
  assert.equal(typeof api.tacticalGoal, 'function');
  const player = api.createActor(api.TANKS[0], 0, 84);
  const left = api.createActor(api.TANKS[1], 0, -84, true);
  const right = api.createActor(api.TANKS[2], 0, -84, true);
  left.cooldown = 0; right.cooldown = 0;
  const first = api.tacticalGoal(left, player, [], 1, true);
  const second = api.tacticalGoal(right, player, [], 2, true);
  assert.equal(first.tactic, 'flank'); assert.equal(second.tactic, 'flank');
  assert.ok(first.position.x * second.position.x < 0);
  const walls = [{ x: 42, z: 0, halfX: 28, halfZ: 28 }];
  left.visual.root.position.set(0, 0, 0); left.cooldown = left.spec.reload;
  const cover = api.tacticalGoal(left, player, walls, 0, true);
  assert.equal(cover.tactic, 'cover');
  assert.ok(cover.position.distanceTo(left.visual.root.position) > 5);
  left.hp = left.maxHp * .2;
  assert.equal(api.tacticalGoal(left, player, walls, 0, true).tactic, 'retreat');
});

test('enemy orders retain flank and retreat routes around objectives; difficulty changes response', () => {
  const player = api.createActor(api.TANKS[0], 0, 84);
  const flank = api.createActor(api.TANKS[1], 0, -84, true); flank.cooldown = 0;
  api.advanceEnemy(flank, player, 1 / 60, [], [flank, player], { slot: 1, objective: new api.Vector3(0, 0, 0) });
  assert.equal(flank.tactic, 'flank'); assert.ok(flank.waypoint.x < -60);
  flank.visual.root.position.copy(flank.waypoint); flank.think = 0;
  api.advanceEnemy(flank, player, 1 / 60, [], [flank, player], { slot: 1, objective: new api.Vector3(0, 0, 0) });
  assert.equal(flank.tactic, 'advance', 'Flanking units must push after reaching their staging junction');
  const retreat = api.createActor(api.TANKS[1], 0, 0, true); retreat.hp = retreat.maxHp * .2; retreat.cooldown = 0;
  api.advanceEnemy(retreat, player, 1, [], [retreat, player], { objective: new api.Vector3(0, 0, 0) });
  assert.equal(retreat.tactic, 'retreat'); assert.ok(Math.abs(retreat.speed) > 0, 'Being inside an objective must not suppress withdrawal');
  const response = difficulty => {
    const actor = api.createActor(api.TANKS[1], 84, 0, true); actor.cooldown = 0; actor.aim = 0;
    api.advanceEnemy(actor, player, .1, [], [actor, player], { difficulty });
    return { aim: Math.abs(actor.aim), think: actor.think };
  };
  const training = response('training'), veteran = response('veteran');
  assert.ok(veteran.aim > training.aim * 1.5); assert.ok(veteran.think < training.think);
});

test('road navigation chooses a connected turn around a building', () => {
  assert.equal(typeof api.roadWaypoint, 'function');
  const current = new api.Vector3(0, 0, 0), goal = new api.Vector3(84, 0, 84);
  const wall = [{ x: 42, z: 42, halfX: 28, halfZ: 28 }];
  const waypoint = api.roadWaypoint(current, goal, wall);
  assert.ok(waypoint.x === 0 || waypoint.z === 0, 'Cannot drive diagonally through the block');
  assert.ok(waypoint.distanceTo(goal) < current.distanceTo(goal));
});

test('road navigation reserves vehicle clearance around a visible building corner', () => {
  const current = new api.Vector3(-10, 0, -72), goal = new api.Vector3(-84, 0, -84);
  const wall = [{ x: -42, z: -42, halfX: 29, halfZ: 29 }];
  const waypoint = api.roadWaypoint(current, goal, wall);
  assert.ok(waypoint.distanceTo(goal) > 1, 'A clear centreline alone cannot justify cutting the corner');
  for (let fraction = 0; fraction <= 1; fraction += .01) {
    const point = current.clone().lerp(waypoint, fraction);
    assert.ok(!(Math.abs(point.x + 42) < 31.3 && Math.abs(point.z + 42) < 31.3), 'Entire route must clear the expanded obstacle');
  }
});

test('enemy continues through a road junction instead of stopping outside the routing threshold', () => {
  const actor = api.createActor(api.TANKS[1], 0, 3, true), player = api.createActor(api.TANKS[0], 84, 84);
  actor.yaw = 0; actor.cooldown = 0; actor.think = 1; actor.waypoint.set(0, 0, 0);
  api.advanceEnemy(actor, player, 1 / 60, [], [actor, player], { tactical: false });
  assert.ok(actor.speed > 0, 'A waypoint 3 m away must still be approached before routing advances at 2 m');
});

test('key rebinding swaps conflicts, rejects reserved keys and round-trips with old settings', () => {
  assert.equal(typeof api.remapBinding, 'function');
  const bindings = api.remapBinding(api.DEFAULT_BINDINGS, 'fire', 'KeyW');
  assert.equal(bindings.fire, 'KeyW'); assert.equal(bindings.forward, 'Space');
  assert.equal(api.remapBinding(bindings, 'fire', 'Escape'), null);
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  data.set('kowloon-armor-settings', JSON.stringify({ quality: 'low', sensitivity: 1.6, reducedMotion: true }));
  const previous = api.loadPreferences();
  assert.equal(previous.quality, 'low'); assert.deepEqual(previous.bindings, api.DEFAULT_BINDINGS);
  assert.equal(api.savePreferences({ ...previous, bindings, scopeMode: 'toggle', scopeZoom: 3, hudScale: 1.15 }), true);
  assert.equal(api.loadPreferences().bindings.fire, 'KeyW'); assert.equal(api.loadPreferences().scopeZoom, 3);
  assert.equal(api.loadPreferences().scopeMode, 'toggle'); assert.equal(api.loadPreferences().hudScale, 1.15);
  delete globalThis.localStorage;
});

test('independent observation leaves the gun bearing unchanged and release returns to the gun', () => {
  const game = fixture(); game.start('drive', 0);
  advance(game, 1, { ...neutral, observe: true, aimX: 1, scope: true });
  assert.equal(game.player.aim, 0); assert.equal(game.scope, false);
  assert.ok(game.observationYaw < -.8); assert.equal(game.observing, true);
  game.update(1 / 60, neutral); assert.equal(game.observing, false);
  game.garage();
});

test('pivoting animates opposite track directions without adding a draw for each link', () => {
  const tank = api.createTank(api.TANKS[0]);
  assert.ok(tank.treads?.isInstancedMesh);
  assert.equal(tank.treads.count, 120);
  api.rotateWheels(tank, 1, -1);
  const left = new api.Matrix4(), right = new api.Matrix4();
  tank.wheels.getMatrixAt(0, left); tank.wheels.getMatrixAt(7, right);
  assert.ok(Math.abs(left.elements[6] + right.elements[6]) < 1e-8);
  assert.ok(Math.abs(left.elements[6]) > .5);
  let released = false; tank.treads.addEventListener('dispose', () => { released = true; });
  api.disposeTank(tank); assert.equal(released, true);
});

test('bursts and track dust remain bounded and clear releases transient resources', () => {
  const scene = new api.Scene(), effects = new api.Effects(scene);
  assert.equal(typeof effects.dust, 'function');
  for (let burst = 0; burst < 100; burst++) { effects.burst(new api.Vector3(), true); effects.dust(new api.Vector3(), 0, 12); }
  const smoke = scene.children.filter(node => node.name === 'combat-smoke');
  assert.ok(smoke.length <= 20);
  const dust = scene.children.find(node => node.name === 'track-dust');
  assert.equal(dust.geometry.getAttribute('position').count, 96);
  let disposed = 0;
  for (const particle of smoke) particle.geometry.addEventListener('dispose', () => disposed++);
  effects.clear(); assert.equal(disposed, smoke.length);
  assert.equal(scene.children.filter(node => node.name === 'combat-smoke').length, 0);
  assert.equal(dust.visible, false);
});

test('spatial sound uses listener orientation and distance, including coincident sounds', () => {
  assert.equal(typeof api.spatialMix, 'function');
  const listener = { x: 0, z: 0 };
  const right = api.spatialMix(listener, 0, { x: 60, z: 0 });
  const left = api.spatialMix(listener, 0, { x: -60, z: 0 });
  assert.ok(right.pan > .9 && left.pan < -.9);
  assert.ok(api.spatialMix(listener, Math.PI, { x: 60, z: 0 }).pan < -.9);
  assert.ok(api.spatialMix(listener, 0, { x: 300, z: 0 }).gain < right.gain);
  assert.equal(api.spatialMix(listener, 0, listener).pan, 0);
  assert.equal(api.spatialMix(listener, 0, listener).gain, 1);
});
