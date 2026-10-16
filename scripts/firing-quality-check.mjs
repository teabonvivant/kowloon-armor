import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export * from './src/effects'; export * from './src/effect-math';
  export * from './src/combat'; export * from './src/actors';
  export { TANKS } from './src/data/tanks';
  export { Scene, Vector3, PerspectiveCamera } from 'three';
` }, bundle: true, platform: 'node', format: 'esm', write: false, define: { __REALISM_SAMPLE__: 'true' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const vector = (horizontal = 0, height = 0, depth = 0) => new api.Vector3(horizontal, height, depth);
const active = pool => pool.slots.filter(particle => particle.life > 0);
const createEffects = () => new api.Effects(new api.Scene());
const intersects = (particle, box) => {
  const radius = (particle.size + Math.max(0, particle.age - particle.delay) * particle.growth) / 2;
  return Math.abs(particle.position.x - box.x) < box.halfX + radius &&
    Math.abs(particle.position.z - box.z) < box.halfZ + radius &&
    particle.position.y - radius < (box.height ?? Infinity);
};

test('gas stays before muzzle clearance throughout its lifetime, including sideways elevated fire', () => {
  for (const direction of [vector(0, 0, -1), vector(-1, .25, 0).normalize()]) {
    const effects = createEffects(), origin = vector(3, 2.6, 8), clearance = .2;
    effects.muzzle(origin, direction, 120, true, clearance);
    assert.ok(effects.stats().smoke > 0, 'a confined shot still releases a small visible gas plume');
    for (let frame = 0; frame < 90; frame++) {
      for (const particle of active(effects.smoke)) {
        const radius = (particle.size + Math.max(0, particle.age - particle.delay) * particle.growth) / 2;
        const leadingEdge = particle.position.clone().sub(origin).dot(direction) + radius;
        assert.ok(leadingEdge <= 2.8 * clearance + 1e-6, `gas crosses muzzle clearance at ${leadingEdge}`);
      }
      effects.update(1 / 60);
    }
    effects.dispose();
  }
});

test('muzzle gas has an expanding front and delayed release instead of equal beads', () => {
  const effects = createEffects();
  effects.muzzle(vector(0, 2.6, 0), vector(0, 0, -1), 120, true);
  const gas = active(effects.smoke);
  assert.ok(gas.length >= 3 && gas.length <= 6);
  assert.ok(gas.at(-1).size > gas[0].size + .15, 'gas front must broaden downstream');
  assert.ok(gas.at(-1).delay > gas[0].delay + .03, 'gas release must progress from muzzle to front');
  assert.ok(gas.every(particle => particle.opacity <= .23), 'gas must keep the target readable');
  effects.update(.1);
  assert.equal(effects.stats().flash, 0, 'hot pulse must finish before the gas wake');
  assert.ok(effects.stats().smoke > 0);
  effects.dispose();
});

test('pressure dust starts on the road with staggered arrival and a smaller mobile budget', () => {
  const desktop = createEffects(), mobile = createEffects();
  mobile.configure({ ...api.DEFAULT_EFFECTS, mobile: true });
  for (const effects of [desktop, mobile]) effects.muzzle(vector(0, 2.6, 0), vector(-1, .15, 0).normalize(), 120, true);
  const dust = active(desktop.dustPool);
  assert.ok(dust.length >= 3 && dust.length <= 5);
  assert.ok(dust.every(particle => particle.position.y >= .05 && particle.position.y <= .2));
  assert.ok(new Set(dust.map(particle => particle.delay)).size > 1, 'pressure reaches each patch at a different time');
  assert.ok(mobile.stats().dust < desktop.stats().dust);
  assert.ok(mobile.stats().smoke < desktop.stats().smoke);
  desktop.dispose(); mobile.dispose();
});

test('plume and pressure dust do not spawn or drift through nearby collision volumes', () => {
  const obstacles = [
    { x: 0, z: -.8, halfX: 3, halfZ: .3, height: 6 },
    { x: 1.1, z: .7, halfX: .3, halfZ: 1, height: 2 },
  ];
  const effects = createEffects();
  effects.muzzle(vector(0, 2.6, 0), vector(0, 0, -1), 120, true, .5 / 2.8, obstacles);
  for (let frame = 0; frame < 100; frame++) {
    for (const pool of [effects.smoke, effects.dustPool]) for (const particle of active(pool)) {
      for (const box of obstacles) assert.equal(intersects(particle, box), false, `${pool.kind} overlaps obstacle at frame ${frame}`);
    }
    effects.update(1 / 60);
  }
  effects.dispose();
});

test('muzzle over a parked obstacle cannot lift dust from inside it', () => {
  const effects = createEffects(), obstacle = { x: 0, z: 0, halfX: 1, halfZ: 2, height: 1.4 };
  effects.muzzle(vector(0, 2.6, 0), vector(0, .1, -1).normalize(), 120, true, 1, [obstacle]);
  assert.equal(effects.stats().dust, 0);
  assert.equal(effects.glow.active, 0);
  assert.ok(effects.stats().smoke > 0, 'gas above the obstacle remains visible');
  effects.dispose();
});

test('clearance checks reject swept radius contact but allow plumes above short obstacles', () => {
  assert.equal(typeof api.effectPathClear, 'function');
  const obstacles = [{ x: 0, z: 0, halfX: 1, halfZ: 1, height: 1.5 }];
  assert.equal(api.effectPathClear(vector(-3, 1, 0), vector(3, 1, 0), .2, obstacles), false);
  assert.equal(api.effectPathClear(vector(-3, 1, 1.1), vector(3, 1, 1.1), .2, obstacles), false);
  assert.equal(api.effectPathClear(vector(-3, 3, 0), vector(3, 3, 0), .2, obstacles), true);
  assert.equal(api.effectPathClear(vector(-3, 1, 2), vector(3, 1, 2), .2, obstacles), true);
});

test('normal combat firing supplies obstacle context to the visual pressure event', () => {
  const scene = new api.Scene(), effects = new api.Effects(scene), combat = new api.Combat(scene, effects, { shot() {}, hit() {} });
  const actor = api.createActor(api.TANKS[0], 0, 0), obstacles = [{ x: 40, z: 0, halfX: 1, halfZ: 1, height: 3 }];
  const emit = effects.muzzle.bind(effects);
  let received;
  effects.muzzle = (...parameters) => { received = parameters[5]; emit(...parameters); };
  assert.equal(combat.fire(actor, obstacles), true);
  assert.equal(received, obstacles);
  combat.dispose(); effects.dispose();
});

test('pressure event remains repeatable, bounded, low-flash compatible and clearable', () => {
  const effects = createEffects(), origin = vector(0, 2.6, 0), direction = vector(0, 0, -1);
  const snapshot = () => [effects.smoke, effects.dustPool].map(pool => active(pool).map(particle =>
    [particle.life, particle.delay, particle.size, particle.opacity, ...particle.position.toArray(), ...particle.velocity.toArray()]));
  effects.muzzle(origin, direction, 120, true);
  const first = snapshot(), radiance = effects.stats().radiance;
  effects.clear(); effects.muzzle(origin, direction, 120, true);
  assert.deepEqual(snapshot(), first);
  effects.configure({ ...api.DEFAULT_EFFECTS, lowFlash: true, reducedMotion: true });
  assert.ok(effects.stats().radiance < radiance * .25);
  for (let shot = 0; shot < 200; shot++) effects.muzzle(origin, direction, 120, true);
  const stats = effects.stats();
  for (const kind of ['smoke', 'dust', 'flash']) assert.ok(stats[kind] <= stats.capacity[kind]);
  effects.clear(); assert.equal(effects.stats().active, 0);
  effects.dispose(); assert.equal(effects.stats().resources, 0);
});
