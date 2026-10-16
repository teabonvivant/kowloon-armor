import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export * from './src/effects'; export * from './src/effect-math'; export * from './src/combat'; export * from './src/actors';
  export * from './src/camera-fx'; export * from './src/camera-framing'; export * from './src/render/tank';
  export { TANKS } from './src/data/tanks'; export { PROP_TABLE } from './src/game-events-v19';
  export { Scene, Group, Vector3, Matrix4 } from 'three';
` }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const v = (x = 0, y = 0, z = 0) => new api.Vector3(x, y, z);
const KINDS = ['barrel', 'lpg', 'vehicle', 'tanker', 'ammo', 'strike'];
const POOLS = ['smoke', 'dust', 'flash', 'sparks', 'debris', 'marks', 'fire', 'glow'];
const MEDIUM = { quality: 'medium', mobile: false, reducedMotion: false, lowFlash: false };
function fx(options = MEDIUM) { const scene = new api.Scene(), e = new api.Effects(scene); e.configure(options); return { scene, e }; }
const lights = scene => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; };
const total = s => POOLS.reduce((n, k) => n + s[k], 0);
const snapshot = e => e.pools.map(p => p.slots.filter(s => s.life > 0).map(s => [s.life, s.delay, s.size, s.opacity, ...s.position.toArray(), ...s.velocity.toArray()]));

test('FX01 budgets: low/touch keep v1.8 values, medium/high rise, monotonic (M08 spirit)', () => {
  const b = api.effectBudget;
  assert.deepEqual([b('low', false).smoke, b('low', false).debris, b('low', false).flash, b('low', false).sparks], [48, 16, 12, 32]);
  assert.deepEqual(b('high', true), b('low', false));
  assert.deepEqual([b('medium', false).smoke, b('medium', false).debris, b('medium', false).flash], [104, 56, 28]);
  assert.deepEqual([b('high', false).smoke, b('high', false).debris, b('high', false).flash, b('high', false).glow], [160, 96, 48, 16]);
  for (const key of Object.keys(b('low', false))) { assert.ok(b('low', false)[key] <= b('medium', false)[key], key); assert.ok(b('medium', false)[key] <= b('high', false)[key], key); }
});
test('FX02 explosion(lpg,1) at medium meets AC-FX-1 and every pool stays inside its limit', () => {
  const { e } = fx(); e.explosion('lpg', v(0, 1, -20), 1);
  const s = e.stats();
  assert.ok(s.flash >= 6 && s.smoke >= 12 && s.debris >= 12 && s.marks >= 1 && s.glow >= 1, JSON.stringify(s));
  assert.ok(s.fire >= 6 && s.fire <= 8 && s.dust >= 12);
  for (const k of POOLS) assert.ok(s[k] <= s.capacity[k], k);
  e.dispose();
});
test('FX03 all kinds x powers: counts in the C02 ranges, monotonic in power, pools bounded on every tier', () => {
  for (const quality of ['low', 'medium', 'high']) for (const mobile of [false, true]) for (const kind of KINDS) {
    let previous = 0;
    for (const power of [.5, 1, 1.5, 2]) {
      const { e } = fx({ quality, mobile, reducedMotion: false, lowFlash: false });
      e.explosion(kind, v(0, 1, -10), power); const s = e.stats();
      for (const k of POOLS) assert.ok(s[k] <= s.capacity[k], `${quality}/${mobile}/${kind}/${k}`);
      assert.ok(s.smoke <= 16 && s.debris <= 20 && s.fire <= 10);
      const mass = s.smoke + s.debris + s.fire; assert.ok(mass >= previous, `monotonic ${quality}/${mobile}/${kind}/${power}: ${mass} < ${previous}`); previous = mass;
      e.dispose();
    }
  }
});
test('FX04 low quality and touch emit at most 40 percent of medium, per pool and in total', () => {
  for (const kind of KINDS) {
    const m = fx(); m.e.explosion(kind, v(0, 1, -10), 1); const medium = m.e.stats();
    for (const options of [{ ...MEDIUM, quality: 'low' }, { ...MEDIUM, mobile: true }]) {
      const l = fx(options); l.e.explosion(kind, v(0, 1, -10), 1); const low = l.e.stats();
      for (const k of POOLS) assert.ok(low[k] <= Math.ceil(medium[k] * .4), `${kind}/${k}: ${low[k]} vs ${medium[k]}`);
      assert.ok(total(low) <= total(medium) * .4, `${kind} total`); l.e.dispose();
    }
    m.e.dispose();
  }
});
test('FX05 lifetimes: smoke gone by 8 s, fire/flash by 12 s, scorch lives 25 s then clears, clear() empties everything', () => {
  for (const kind of KINDS) {
    const { e } = fx({ ...MEDIUM, quality: 'high' }); e.explosion(kind, v(0, 1, -10), 2);
    const lives = POOLS.flatMap(k => e.pools.find(p => p.kind === ({ dust: 'dust', smoke: 'smoke', flash: 'flash', sparks: 'spark', debris: 'debris', marks: 'mark', fire: 'fire', glow: 'glow' })[k]).slots.filter(s => s.life > 0).map(s => [k, s.life + s.delay]));
    for (const [k, t] of lives) { assert.ok(t <= (k === 'marks' ? 25 : 8) + 1e-9, `${kind}/${k} ${t}`); }
    const marks = lives.filter(([k]) => k === 'marks'); assert.ok(marks.some(([, t]) => Math.abs(t - 25) < 1e-9), 'scorch 25 s');
    for (let i = 0; i < 24 * 60; i++) e.update(1 / 60);
    assert.equal(e.stats().smoke + e.stats().fire + e.stats().flash + e.stats().debris + e.stats().glow + e.stats().dust, 0);
    assert.ok(e.stats().marks >= 1, 'scorch persists at 24 s');
    for (let i = 0; i < 2 * 60; i++) e.update(1 / 60);
    assert.equal(e.stats().active, 0, 'everything expired by 26 s');
    e.explosion(kind, v(), 1); assert.ok(e.stats().active > 0); e.clear(); assert.equal(e.stats().active, 0); e.dispose();
  }
});
test('FX06 no new lights, no new scene objects after construction; dispose releases every pool', () => {
  const scene = new api.Scene(), e = new api.Effects(scene), before = scene.children.length;
  e.explosion('tanker', v(), 2); e.muzzle(v(0, 2.5, 0), v(0, 0, -1), 152, true);
  assert.equal(lights(scene), 0); assert.equal(scene.children.length, before);
  const resources = new Set(); scene.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
  let disposed = 0; for (const r of resources) r.addEventListener('dispose', () => disposed++);
  e.dispose(); e.dispose(); assert.equal(disposed, resources.size); assert.equal(scene.children.length, 0);
});
test('FX07 explosion is deterministic after clear() and never touches global Math.random', () => {
  const { e } = fx(); const rnd = Math.random; let calls = 0; Math.random = () => { calls++; return .5; };
  try { e.explosion('vehicle', v(3, 1, -12), 1.4); const first = snapshot(e); e.clear(); e.explosion('vehicle', v(3, 1, -12), 1.4);
    assert.deepEqual(snapshot(e), first); assert.equal(calls, 0); } finally { Math.random = rnd; }
  e.dispose();
});
test('FX08 distance and low-flash: far blasts thin out or vanish; lowFlash dims additive layers to 0.18', () => {
  const { e } = fx(); e.observe(v()); e.explosion('barrel', v(0, 1, -400), 1); assert.equal(e.stats().active, 0);
  e.explosion('barrel', v(0, 1, -100), 1); const far = e.stats(); e.clear(); e.explosion('barrel', v(0, 1, -10), 1);
  assert.ok(far.smoke < e.stats().smoke); e.update(.05); const bright = e.stats().emissive; e.clear();
  e.configure({ ...MEDIUM, lowFlash: true }); e.explosion('barrel', v(0, 1, -10), 1); e.update(.05);
  assert.ok(e.stats().emissive <= bright * .18 + 1e-6, `${e.stats().emissive} vs ${bright}`); e.dispose();
});
test('FX09 muzzle on the main line: ground ring, two opposite side jets, bounded light pulse hook, no lights', () => {
  const scene = new api.Scene(), e = new api.Effects(scene); const pulses = []; e.lightPulse = (s, t) => pulses.push([s, t]);
  e.muzzle(v(0, 2.5, 0), v(0, 0, -1), 120, true);
  assert.equal(pulses.length, 1); assert.ok(pulses[0][0] > 0 && pulses[0][0] <= 1 && pulses[0][1] <= .09);
  const glows = e.glow.slots.filter(p => p.life > 0); assert.ok(glows.length >= 2, 'ground flash + shock ring');
  const ring = glows.find(p => p.growth > 0); assert.ok(ring && ring.life <= .15 && ring.size + ring.growth * ring.life >= 3.3 * .9, 'ring radius ~ 0.6 x plume length');
  const jets = e.flash.slots.filter(p => p.life > 0 && Math.abs(p.normal.y) < .01 && Math.abs(p.normal.x) > .99);
  assert.equal(jets.length, 2); assert.ok(jets[0].normal.dot(jets[1].normal) < -.99);
  assert.equal(lights(scene), 0); e.dispose();
});
test('FX10 muzzle ring, jets and dust stay out of nearby collision volumes (AC-FX-5)', () => {
  const { e } = fx(); const wall = [{ x: 0, z: -.8, halfX: 3, halfZ: .3, height: 6 }, { x: 0, z: 0, halfX: 1, halfZ: 2, height: 1.4 }];
  e.muzzle(v(0, 2.6, 0), v(0, 0, -1), 120, true, 1, wall);
  assert.equal(e.stats().dust, 0); assert.equal(e.glow.active, 0); e.dispose();
});
test('FX11 tracer length: <= 6 m at >= 120 m/s, <= 4 m below, never beyond the distance flown', () => {
  for (const speed of [40, 119, 120, 190, 400]) for (const flown of [0, .5, 3, 5.9, 50]) {
    const len = api.tracerLengthV19(speed, flown); assert.ok(len <= (speed >= 120 ? 6 : 4) + 1e-9 && len <= flown + 1e-9 && len >= 0);
  }
  assert.ok(api.tracerLengthV19(190, 100) > 5.9);
});
function combat(events = {}) {
  const scene = new api.Scene(), e = new api.Effects(scene), contacts = [], hits = [], flybys = [];
  const c = new api.Combat(scene, e, { shot() {}, hit: (...a) => hits.push(a), contact: x => contacts.push(x), flyby: (...a) => flybys.push(a), ...events });
  return { scene, e, c, contacts, hits, flybys };
}
test('FX12 in-flight shell has a bright core + warm halo, each <= 6 m and <= flown distance; low/touch fire no smoke trail', () => {
  const { c, e } = combat(); const actor = api.createActor(api.TANKS[0], 0, 0); c.fire(actor, []);
  const mat = new api.Matrix4();
  for (let i = 0; i < 6; i++) {
    c.update(1 / 60, [actor], [], 1);
    const shell = c.shells.find(s => s.source); c.tracers.getMatrixAt(0, mat); const core = new api.Vector3().setFromMatrixScale(mat).z * 2;
    c.tracers.getMatrixAt(32, mat); const halo = new api.Vector3().setFromMatrixScale(mat); 
    assert.ok(core <= 6 + 1e-4 && core <= shell.flown + 1e-4, `${core} vs ${shell.flown}`); assert.ok(halo.x > 0 && halo.z * 2 >= core - 1e-9);
  }
  for (let i = 0; i < 20; i++) c.update(1 / 60, [actor], [], 1);
  c.tracers.getMatrixAt(0, mat); assert.ok(new api.Vector3().setFromMatrixScale(mat).z * 2 > 5.5, 'reaches the 6 m streak');
  assert.equal(c.tracers.count, 64);
  for (const options of [{ ...MEDIUM, quality: 'low' }, { ...MEDIUM, mobile: true }, MEDIUM]) { e.configure(options); e.clear(); e.trail(v(0, 2, 30), true); assert.equal(e.stats().smoke, 0); }
  e.configure({ ...MEDIUM, quality: 'high' }); e.trail(v(0, 2, 30), true); assert.equal(e.stats().smoke, 1);
  c.dispose(); e.dispose();
});
function flybyRun(x, z = 60) {
  const r = combat(); const player = api.createActor(api.TANKS[0], 0, 0), enemy = api.createActor(api.TANKS[0], x, z, true);
  enemy.aim = 0; enemy.yaw = 0; enemy.cooldown = 0; for (let i = 0; i < 120; i++) { if (i === 0) r.c.fire(enemy, []); r.c.update(1 / 60, [player, enemy], [], 1); }
  return r;
}
test('FX13 flyby: exactly once for a near miss, never for a hit or a distant shot; hit damage untouched', () => {
  const near = flybyRun(8); assert.equal(near.flybys.length, 1); assert.equal(near.hits.length, 0);
  const [pos, speed, calibre] = near.flybys[0]; assert.ok(pos.x > 0 && Math.abs(pos.x - 8) < 1.5 && speed > 100 && calibre > 0);
  assert.equal(flybyRun(40).flybys.length, 0);
  const hit = flybyRun(0); assert.equal(hit.flybys.length, 0); assert.equal(hit.hits.length, 1);
  const spec = api.TANKS[0], armor = 1.35 - spec.armor / 200;
  const allowed = [.85, 1.15, 1.5].flatMap(f => [f, f * .95]).map(f => Math.min(spec.hp, Math.round(spec.damage * f * armor)));
  assert.ok(allowed.includes(hit.hits[0][0]), `enemy damage ${hit.hits[0][0]} follows the v1.8 formula`);
});
test('FX14 impactGrade table at fixed incidence angles (AC-FX-8)', () => {
  const g = api.impactGrade, cos = deg => Math.cos(deg * Math.PI / 180);
  const t = (deg, factor, face, destroyed = false) => g({ target: true, cosIncidence: cos(deg), factor, face, destroyed });
  assert.equal(t(0, 1.15, 'side'), 'penetrate'); assert.equal(t(30, .85, 'front'), 'penetrate'); assert.equal(t(55, 1.5, 'rear'), 'penetrate');
  assert.equal(t(65, .85, 'front'), 'blocked'); assert.equal(t(20, .357, 'front'), 'blocked'); assert.equal(t(20, .63, 'rear'), 'blocked');
  assert.equal(t(75, 1.15, 'side'), 'ricochet'); assert.equal(t(85, .85, 'front'), 'ricochet'); assert.equal(t(80, .357, 'side'), 'ricochet');
  assert.equal(t(85, .85, 'front', true), 'penetrate', 'a kill is always a penetration');
  assert.equal(g({ target: false, cosIncidence: cos(80) }), 'ricochet'); assert.equal(g({ target: false, cosIncidence: cos(20) }), 'blocked');
  assert.equal(g({ target: false, cosIncidence: NaN }), 'blocked');
});
test('FX15 combat tags contacts with a grade and damage equals the v1.8 formula', () => {
  const { c, contacts, hits } = combat(); const actor = api.createActor(api.TANKS[0], 0, 0), target = api.createActor(api.TANKS[0], 0, -30, true);
  target.visual.root.rotation.y = target.yaw; c.fire(actor, []); for (let i = 0; i < 20; i++) c.update(1 / 60, [actor, target], [], 1);
  assert.equal(hits[0][0], Math.round(actor.spec.damage * .85 * .95 * (1.35 - target.spec.armor / 200) * 1.9));
  assert.ok(['penetrate', 'ricochet', 'blocked'].includes(contacts[0].grade));
  target.hp = 1; actor.cooldown = 0; c.fire(actor, []); for (let i = 0; i < 20; i++) c.update(1 / 60, [actor, target], [], 1);
  assert.equal(contacts[1].grade, 'penetrate'); assert.equal(contacts[1].destroyed, true);
  const wall = [{ x: 0, z: -15, halfX: 4, halfZ: 1 }], r = combat(); const a2 = api.createActor(api.TANKS[0], 0, 0);
  r.c.fire(a2, wall); for (let i = 0; i < 20; i++) r.c.update(1 / 60, [a2], wall, 1);
  assert.equal(r.contacts[0].grade, 'blocked'); c.dispose(); r.c.dispose();
});
test('FX16 impact visuals differ by grade: penetrate = inner fire + ring smoke, ricochet = spark fan, blocked = dust', () => {
  const run = grade => { const { e } = fx(); e.impact(v(0, 2, 0), v(0, 0, 1), v(.2, 0, -1).normalize(), 'armor', 120, null, grade); const s = e.stats(), dust = s.dust; const out = { ...s, dust }; e.dispose(); return out; };
  const pen = run('penetrate'), ric = run('ricochet'), blk = run('blocked'), base = run(undefined);
  assert.ok(pen.fire >= 2 && ric.fire === 0 && blk.fire === 0);
  assert.ok(ric.sparks > pen.sparks * 1.0 && ric.sparks > blk.sparks * 3);
  assert.ok(blk.dust > 0 && pen.dust === 0 && ric.dust === 0);
  assert.ok(pen.smoke > base.smoke && base.fire === 0);
});
test('FX17 ricochet sparks fan around the reflected direction; blocked sparks are few', () => {
  const { e } = fx(); const incoming = v(.3, 0, -1).normalize(), normal = v(0, 0, 1), refl = api.impactDirection(incoming, normal);
  e.impact(v(0, 2, 0), normal, incoming, 'armor', 120, null, 'ricochet');
  const sp = e.sparks.slots.filter(p => p.life > 0); assert.ok(sp.length >= 10);
  assert.ok(sp.every(p => p.velocity.dot(normal) >= 0)); assert.ok(sp.filter(p => p.velocity.clone().normalize().dot(refl) > .7).length >= sp.length * .7);
  e.dispose();
});
test('FX18 camera blast: <= 0.6 m, <= 1.2 deg, gone in 0.5 s (<5% at 0.7 s), reduced motion = 0, scope <= 0.12', () => {
  let maxO = 0, maxR = 0;
  for (const power of [.5, 1, 2, 5]) for (const d of [0, 5, 30, 80]) for (let a = 0; a < .7; a += .005) {
    const k = api.blastImpulse(a, power, d, false); maxO = Math.max(maxO, Math.abs(k.offset)); maxR = Math.max(maxR, Math.abs(k.roll));
    assert.deepEqual(api.blastImpulse(a, power, d, true), { offset: 0, roll: 0 });
  }
  assert.ok(maxO <= .6 + 1e-9 && maxO > .35, `offset ${maxO}`); assert.ok(maxR <= 1.2 * Math.PI / 180 + 1e-9 && maxR > .008, `roll ${maxR}`);
  assert.equal(api.blastImpulse(.7, 2, 0, false).offset, 0); assert.equal(api.blastImpulse(.5, 2, 0, false).offset, 0);
  assert.ok(api.blastImpulse(.1, 2, 100, false).offset === 0, 'far blast does not shake');
  assert.ok(api.viewFactor('chase', true, 4) <= .12 && api.viewFactor('chase', true, 1) <= .12);
  const scope = Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(api.blastImpulse(i * .005, 2, 0, false, api.viewFactor('chase', true, 1)).offset)));
  assert.ok(scope <= .6 * .12 + 1e-9);
});
test('FX19 kill push-in: 0.5 s, FOV >= -6 deg, interruptible within 80 ms, none under reduced motion', () => {
  let min = 0; for (let a = 0; a <= .6; a += .005) { const p = api.killcamPush(a, false); min = Math.min(min, p.fov); if (a >= .5) assert.equal(p.fov, 0); }
  assert.ok(min >= -6 - 1e-9 && min < -5.5, `fov ${min}`);
  const at = .2, held = api.killcamPush(at, false).fov; assert.ok(held < -2);
  assert.ok(Math.abs(api.killcamPush(at + .04, false, at).fov) <= Math.abs(held) * .55 + 1e-9);
  assert.equal(api.killcamPush(at + .08, false, at).fov, 0); assert.equal(api.killcamPush(.25, true).fov, 0);
});
test('FX20 light pulse is bounded: <= +15 %, <= 90 ms, 0.18x under low flash, none under reduced motion', () => {
  let max = 1; for (let a = 0; a < .2; a += .002) { const g = api.lightPulseGain(a, 1, false, false); max = Math.max(max, g); if (a >= .09) assert.equal(g, 1); }
  assert.ok(max <= 1.15 + 1e-9 && max > 1.1); assert.equal(api.lightPulseGain(.01, 9, false, false) <= 1.15, true);
  assert.ok(api.lightPulseGain(0, 1, false, true) - 1 <= .15 * .18 + 1e-9); assert.equal(api.lightPulseGain(0, 1, true, false), 1);
  assert.ok(api.lightPulseGain(0, 1, false, false, 5) <= 1.15, 'duration is clamped to 90 ms');
});
test('FX21 low chase camera: 5.5-7.1 m in the open, rises toward 8.2 m next to a wall; hit-stop scale constant is 0.35', () => {
  for (const d of [8, 12, 15, 20, 30]) { const h = api.lowChaseHeight(d, 1); assert.ok(h >= 5.5 && h <= 7.1, `${d}: ${h}`); }
  assert.ok(api.lowChaseHeight(15, .2) > api.lowChaseHeight(15, 1)); assert.equal(api.lowChaseHeight(15, 0), 8.2);
  assert.equal(api.HITSTOP_LIMITS.scale, .35);
});
test('FX22 cook-off is deterministic, ~50 %, and only for turret ring / rear strikes', () => {
  let yes = 0; for (let i = 0; i < 2000; i++) { const a = api.shouldCookOff(1234, i, 'turret'); assert.equal(a, api.shouldCookOff(1234, i, 'turret')); yes += a; }
  assert.ok(yes > 900 && yes < 1100, `${yes}`);
  for (const zone of ['hull', 'leftTrack', 'rightTrack']) for (let i = 0; i < 50; i++) assert.equal(api.shouldCookOff(7, i, zone), false);
  assert.ok(Array.from({ length: 50 }, (_, i) => api.shouldCookOff(7, i, 'hull', 'rear')).some(Boolean));
  assert.notDeepEqual(Array.from({ length: 64 }, (_, i) => api.shouldCookOff(1, i, 'turret')), Array.from({ length: 64 }, (_, i) => api.shouldCookOff(2, i, 'turret')));
});
test('FX23 turret flight: apex 6-10 m, lands inside 2 s, deterministic by seed, restore is exact', () => {
  for (const seed of [1, 99, 123456, 7]) {
    const a = api.createActor(api.TANKS[0], 0, 0), b = api.createActor(api.TANKS[0], 0, 0), home = a.visual.turret.position.clone();
    api.launchTurret(a.visual, seed); api.launchTurret(b.visual, seed); assert.ok(api.isTurretFlying(a.visual));
    let t = 0, apex = home.y, airborne = true;
    while (airborne && t < 3) { airborne = api.updateTurretFlight(a.visual, 1 / 60); api.updateTurretFlight(b.visual, 1 / 60); t += 1 / 60; apex = Math.max(apex, a.visual.turret.position.y); }
    assert.ok(t <= 2 + 1 / 60, `landed in ${t}`); assert.ok(t >= 1.5 - 1 / 60);
    assert.ok(apex - home.y >= 6 - .3 && apex - home.y <= 10 + .3, `apex ${apex - home.y}`);
    assert.deepEqual(a.visual.turret.position.toArray(), b.visual.turret.position.toArray());
    assert.ok(a.visual.turret.position.y < 1.2 && a.visual.turret.position.y >= 0);
    assert.equal(api.updateTurretFlight(a.visual, 1), false);
    api.restoreTurret(a.visual); assert.deepEqual(a.visual.turret.position.toArray(), home.toArray()); assert.equal(api.isTurretLaunched(a.visual), false);
    assert.deepEqual(a.visual.turret.rotation.toArray().slice(0, 3), [0, 0, 0]);
    api.disposeTank(a.visual); api.disposeTank(b.visual);
  }
});
test('FX24 8 launch/dispose cycles do not grow geometry, material or flight bookkeeping; disposeTank restores first', () => {
  const unique = new Set(); const perCycle = [];
  for (let i = 0; i < 8; i++) {
    const a = api.createActor(api.TANKS[i % api.TANKS.length], 0, 0), root = a.visual.root, turret = a.visual.turret, home = turret.position.clone();
    api.launchTurret(a.visual, i); for (let k = 0; k < 30; k++) api.updateTurretFlight(a.visual, 1 / 60);
    const cycle = new Set(); root.traverse(o => { if (o.geometry) cycle.add(o.geometry); if (o.material) cycle.add(o.material); });
    perCycle.push(cycle.size); for (const r of cycle) unique.add(r);
    api.disposeTank(a.visual); assert.equal(api.isTurretLaunched(a.visual), false); assert.deepEqual(turret.position.toArray(), home.toArray());
    assert.equal(turret.parent !== null, true, 'turret is never detached from the hull');
  }
  assert.ok(Math.max(...perCycle) - Math.min(...perCycle) <= 12);
  const same = new Set(); for (let i = 0; i < 8; i++) { const a = api.createActor(api.TANKS[0], 0, 0); a.visual.root.traverse(o => { if (o.geometry) same.add(o.geometry); if (o.material) same.add(o.material); }); api.disposeTank(a.visual); }
  assert.ok(same.size <= perCycle[0] + 40, `shared resources stay shared: ${same.size}`);
});
