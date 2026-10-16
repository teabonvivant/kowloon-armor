import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

// v1.9 gameplay layer: opening corridor (C01), explosive family (C10), campaign balance guard (D6),
// comfort gates (D4), rebinding / HOTAS strike (D5) and hit-stop budget (D3). Real city, real Game, fixed 60 Hz.
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export { Game, CAMPAIGN_GUARD } from './src/game';
  export { createWorld } from './src/render/world';
  export { createActor } from './src/actors';
  export { TANKS } from './src/data/tanks';
  export { MISSIONS } from './src/data/missions';
  export { blocked, wallFraction } from './src/math';
  export { Scene, Group, Vector3 } from 'three';
  export { arcadeRating, openingGroups, comboMultiplier } from './src/arcade';
  export { PROP_TABLE } from './src/game-events-v19';
  export { flashAllowed, FLASH_ALPHA, GUIDE } from './src/arcade-hud';
  export { ACTIONS, DEFAULT_BINDINGS, migrateBindings, keyBindingsSchema, remapBinding } from './src/key-bindings';
  export { controllerSchema, HOTAS_PRESET, XBOX_PRESET } from './src/input-config';
  export { ControllerPoller } from './src/input-controller';
  export { HitStopBudget, HITSTOP_LIMITS } from './src/camera-fx';
  export { isTurretLaunched, isTurretFlying } from './src/render/tank';
  export { shouldCookOff } from './src/effect-math';
` }, bundle: true, format: 'esm', platform: 'node', write: false, define: { __REALISM_SAMPLE__: 'false' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const world = api.createWorld(); delete globalThis.document;
const idle = { throttle: 0, steer: 0, brake: false, aimX: 0, aimY: 0, fire: false, scope: false, toggleCamera: false, pause: false };
const events = () => ({ popups: [], hits: [], explosions: [], kills: 0 });
function make(mode = 'battle', mission = 0, seed = 7, withWorld = true) {
  const log = events();
  const game = new api.Game(new api.Scene(), withWorld ? world : { group: new api.Group(), obstacles: [] },
    { shot() {}, hit: (d, k, e) => log.hits.push({ d, k, e }), finish() {}, notify() {}, popup: (t, k) => log.popups.push({ t, k }),
      explosion: e => log.explosions.push({ kind: e.kind, power: e.power, at: game.elapsed }) });
  game.start(mode, mission, 'standard', seed);
  return { game, log };
}
const run = (game, seconds, input = idle) => { for (let i = 0; i < Math.round(seconds * 60); i++) game.update(1 / 60, input); };
const aimAt = (game, x, z) => { const p = game.player.visual.root.position; game.player.aim = Math.atan2(-(x - p.x), -(z - p.z)); game.player.yaw = game.player.aim; };
const centroid = props => ({ x: props.reduce((s, p) => s + p.x, 0) / props.length, z: props.reduce((s, p) => s + p.z, 0) / props.length });

test('AC-OPEN-1 opening corridor exists in front of every spawn: 200 seeds x 3 modes + 6 missions', () => {
  const combos = [['drive', 0], ['battle', 0], ['survival', 0], ...[0, 1, 2, 3, 4, 5].map(m => ['campaign', m])];
  let checked = 0;
  for (const [mode, mission] of combos) {
    for (let seed = 1; seed <= 200; seed++) {
      const { game } = make(mode, mission, seed);
      const spawn = game.player.visual.root.position, group = game.arcade.opening[0];
      assert.ok(group && group.length >= 3, `${mode}/${mission}/${seed}: first group has >= 3 chaining props`);
      const c = centroid(group), distance = Math.hypot(c.x - spawn.x, c.z - spawn.z);
      const angle = Math.atan2(Math.abs(c.x - spawn.x), spawn.z - c.z) * 180 / Math.PI;
      assert.ok(distance >= 25 && distance <= 50, `${mode}/${mission}/${seed}: distance ${distance.toFixed(1)} within 25-50 m`);
      assert.ok(angle <= 20, `${mode}/${mission}/${seed}: ${angle.toFixed(1)} deg inside the +-20 deg cone`);
      for (const prop of group) {
        assert.equal(api.blocked(prop.x, prop.z, world.obstacles, 4.5), false, 'no overlap with obstacles (4.5 m margin)');
        assert.equal(api.wallFraction(spawn.x, spawn.z, prop.x - spawn.x, prop.z - spawn.z, world.obstacles), 1, 'clear line of sight');
        assert.ok(Math.hypot(prop.x - c.x, prop.z - c.z) <= 6, 'members within 6 m so one hit chains the group');
      }
      checked++;
    }
  }
  assert.equal(checked, 1800);
});

test('opening corridor keeps enemy lanes clear and never changes enemy count or position', () => {
  for (let mission = 0; mission < 6; mission++) {
    const { game } = make('campaign', mission, 31);
    const spawn = game.player.visual.root.position;
    assert.equal(game.enemies.length, api.MISSIONS[mission].targets.length, 'enemy count is the mission table');
    for (const [index, enemy] of game.enemies.entries()) {
      const target = api.MISSIONS[mission].targets[index];
      assert.equal(enemy.visual.root.position.x, target[0]); assert.equal(enemy.visual.root.position.z, target[1]);
      for (const prop of game.arcade.props) {
        const dx = enemy.visual.root.position.x - spawn.x, dz = enemy.visual.root.position.z - spawn.z;
        const t = Math.max(0, Math.min(1, ((prop.x - spawn.x) * dx + (prop.z - spawn.z) * dz) / (dx * dx + dz * dz)));
        assert.ok(Math.hypot(spawn.x + dx * t - prop.x, spawn.z + dz * t - prop.z) >= (prop.opening ? 3.6 : 4.5) || Math.hypot(prop.x - spawn.x, prop.z - spawn.z) < 1,
          `mission ${mission + 1}: prop ${prop.kind} keeps the straight shell lane to an enemy clear`);
      }
    }
  }
});

test('AC-OPEN-2 first shot at 1.5 s: first detonation by 2.2 s and >= 3 detonations within 1.5 s', () => {
  for (const seed of [3, 11, 29, 97]) {
    const { game, log } = make('drive', 0, seed);
    const group = game.arcade.opening[0], c = centroid(group);
    run(game, 1.5); aimAt(game, c.x, c.z);
    game.player.pitch = 0;
    const startShots = game.shots; let first = -1, within = 0;
    for (let i = 0; i < 4 * 60; i++) {
      game.update(1 / 60, { ...idle, fire: game.shots === startShots });
      if (first < 0 && game.arcade.propsDestroyed > 0) first = game.elapsed;
      if (first >= 0 && game.elapsed - first <= 1.5) within = game.arcade.propsDestroyed;
    }
    assert.ok(first > 1.5 && first <= 2.2, `seed ${seed}: first detonation at ${first.toFixed(2)} s`);
    assert.ok(within >= 3, `seed ${seed}: ${within} detonations within 1.5 s of the first`);
    assert.ok(log.explosions.length >= 3);
  }
});

test('AC-OPEN-4 explosive family table, chain delay window, no double detonation, tanker fuse and LPG second blast', () => {
  assert.deepEqual([api.PROP_TABLE.barrel.radius, api.PROP_TABLE.barrel.damage, api.PROP_TABLE.car.radius, api.PROP_TABLE.car.damage], [11, 90, 14, 120],
    'v1.8 radii and damage are unchanged');
  for (const [kind, spec] of Object.entries(api.PROP_TABLE)) assert.ok(spec.radius >= 11 && spec.damage >= 90 && spec.power > 0, kind);
  const { game, log } = make('drive', 0, 5, false);
  game.arcade.clear(); game.enemies.length = 0;
  const mk = (id, kind, x, z) => { const prop = { id, kind, x, z, radius: 1, height: 3.4, alive: true, root: new api.Group() }; game.arcade.props.push(prop); return prop; };
  const a = mk(1, 'barrel', 0, 40), b = mk(2, 'barrel', 5, 40);
  game.blastProp(a, true); game.blastProp(a, true);
  assert.equal(log.explosions.length, 1, 'a prop never detonates twice');
  assert.equal(b.alive, true, 'neighbour waits');
  let at = -1; for (let i = 0; i < 90; i++) { game.update(1 / 60, idle); if (!b.alive && at < 0) at = (i + 1) / 60; }
  assert.ok(at >= .12 && at <= .7 + 1 / 60, `chain delay ${at.toFixed(2)} s within 0.12-0.7 s`);
  // tanker: visible fuse then the big blast
  const tanker = mk(3, 'tanker', 30, 40), before = log.explosions.length;
  game.blastProp(tanker, true);
  assert.equal(tanker.alive, true); assert.equal(tanker.fuse, true); assert.equal(log.explosions.length, before, 'no blast during the leak');
  run(game, 1.5); assert.equal(tanker.alive, true, 'still burning after 1.5 s');
  run(game, 2); assert.equal(tanker.alive, false, 'blows 2-3 s after the hit');
  assert.ok(log.explosions.some(e => e.kind === 'tanker'));
  // LPG: primary + second blast 0.6-1.0 s later
  const lpg = mk(4, 'lpg', -60, 40), n0 = log.explosions.length, t0 = game.elapsed;
  game.blastProp(lpg, true);
  assert.equal(log.explosions.length, n0 + 1);
  run(game, 1.2);
  const second = log.explosions.slice(n0 + 1).find(e => e.kind === 'lpg');
  assert.ok(second && second.at - t0 >= .59 && second.at - t0 <= 1.05, 'LPG cylinder blows a second time within 0.6-1.0 s');
});

test('vehicles are thrown >= 1.5 m, tumble and keep burning 8-12 s; props never block the player when destroyed', () => {
  const { game } = make('drive', 0, 5, false);
  game.arcade.clear(); game.enemies.length = 0;
  const prop = { id: 21, kind: 'car', x: 0, z: 40, radius: 2.4, height: 3.4, alive: true, root: new api.Group() };
  game.arcade.props.push(prop);
  game.blastProp(prop, true);
  assert.ok(prop.burn >= 8 && prop.burn <= 12, `burns ${prop.burn} s`);
  let peak = 0; for (let i = 0; i < 90; i++) { game.update(1 / 60, idle); peak = Math.max(peak, prop.root.position.y); }
  assert.ok(peak >= 1.5, `thrown ${peak.toFixed(2)} m`);
  assert.equal(prop.root.position.y, 0, 'lands');
  run(game, 13); assert.equal(prop.burn, 0, 'fire is out after its 8-12 s');
  assert.equal(game.arcade.test({ x: 0, y: 1, z: 60 }, new api.Vector3(0, 0, -40)), null, 'a wreck no longer stops shells');
});

test('AC-OPEN-3 campaign balance guard: capped prop damage, no self damage, capped repair and pickups', () => {
  for (let mission = 0; mission < 6; mission++) {
    const { game } = make('campaign', mission, 17);
    const totalHp = game.enemies.reduce((sum, e) => sum + e.maxHp, 0);
    assert.equal(game.propDamageCap, Math.round(totalHp * .15));
    const playerHp = game.player.hp;
    // abuse: detonate every prop and drop seven strikes' worth of blasts on top of every enemy
    for (const enemy of game.enemies) for (let k = 0; k < 40; k++) game.explode(enemy.visual.root.position.x, enemy.visual.root.position.z, 14, 120, false, true, 'vehicle', 1.4);
    const p = game.player.visual.root.position;
    for (let k = 0; k < 10; k++) game.explode(p.x, p.z, 14, 120, false, true, 'vehicle', 1.4);
    for (const prop of [...game.arcade.props]) game.blastProp(prop, true);
    const dealt = game.enemies.reduce((sum, e) => sum + (e.maxHp - e.hp), 0);
    assert.ok(dealt <= totalHp * .15 + 1, `mission ${mission + 1}: props dealt ${dealt} of ${totalHp} (cap ${Math.round(totalHp * .15)})`);
    assert.equal(game.player.hp, playerHp, 'props never hurt the player in the campaign');
    assert.ok(game.enemies.filter(e => !e.alive).every(e => e.maxHp <= game.propDamageCap), 'only an enemy whose whole HP fits inside the 15% pool can fall to props');
    // pickups: repeated repair packs heal at most 30% of max and at most three drop
    game.player.hp = 1;
    for (let k = 0; k < 6; k++) { game.arcade.dropPickup('repair', p.x + 1, p.z); game.update(1 / 60, idle); }
    assert.ok(game.player.hp - 1 <= Math.round(game.player.maxHp * .3) + 1, `mission ${mission + 1}: repair total <= 30% max`);
    assert.equal(game.repairGiven <= Math.round(game.player.maxHp * .3), true);
  }
  const { game } = make('campaign', 0, 2);
  for (let k = 0; k < 8; k++) { game.kills = k; game.onKill(0, -50 - k); }
  assert.ok(game.pickupsDropped <= 3 && game.arcade.pickups.length <= 3, 'at most 3 pickups per campaign sortie');
  const free = make('battle', 0, 2).game;
  for (let k = 0; k < 8; k++) { free.kills = k; free.onKill(0, -50 - k); }
  assert.ok(free.arcade.pickups.length > 3, 'other modes keep the full arcade drops');
});

test('non-campaign modes keep full prop damage (no guard) and the player can still be hurt', () => {
  const { game } = make('battle', 0, 9, false);
  game.arcade.clear(); game.enemies.length = 0;
  const e = api.createActor(api.TANKS[0], 3, 40, true); e.hp = e.maxHp = 400; game.enemies.push(e);
  const prop = { id: 40, kind: 'barrel', x: 0, z: 40, radius: 1, height: 3.4, alive: true, root: new api.Group() };
  game.arcade.props.push(prop); game.blastProp(prop, true);
  assert.ok(400 - e.hp >= 70, `full barrel damage ${400 - e.hp}`);
});

test('AC-CAM-2 hit-stop: single <= 100 ms, 2 s window <= 250 ms, time scale >= 0.35', () => {
  const budget = new api.HitStopBudget();
  let total = 0, worst = 0;
  for (let i = 0; i < 30; i++) { const granted = budget.grant(i * .05, i % 2 ? 'explosion' : 'kill'); total += granted; worst = Math.max(worst, granted); }
  assert.ok(worst <= api.HITSTOP_LIMITS.single + 1e-9 && worst <= .1);
  assert.ok(total > 0, 'some hit-stop is granted');
  const window = new api.HitStopBudget(); let inWindow = 0;
  for (let i = 0; i < 20; i++) inWindow += window.grant(i * .05, 'kill');
  assert.ok(inWindow <= .25 + 1e-9, `${inWindow.toFixed(3)} s granted inside one 2 s window`);
  assert.ok(api.HITSTOP_LIMITS.scale >= .35);
  const { game } = make('battle', 0, 4, false);
  game.arcade.clear(); game.enemies.length = 0;
  for (let i = 0; i < 12; i++) game.arcade.props.push({ id: 100 + i, kind: 'barrel', x: i * 3, z: 40, radius: 1, height: 3.4, alive: true, root: new api.Group() });
  let peak = 0;
  game.blastProp(game.arcade.props[0], true);
  for (let i = 0; i < 180; i++) { game.update(1 / 60, idle); peak = Math.max(peak, game.hitStop); }
  assert.ok(peak <= .1 + 1e-9, `chain peak hit-stop ${peak}`);
  assert.equal(game.timeScale >= .35, true);
});

test('AC-UX-4 flash comfort: no flash under low-flash or reduced motion, <= 10% brightness otherwise', () => {
  assert.equal(api.flashAllowed(true, false), false);
  assert.equal(api.flashAllowed(false, true), false);
  assert.equal(api.flashAllowed(false, false), true);
  assert.ok(api.FLASH_ALPHA <= .1);
  assert.ok(api.GUIDE.cardSeconds <= 1.2, 'title card <= 1.2 s');
});

test('AC-UX-3 strike key is the 17th rebindable action, old settings migrate, HOTAS has a strike button', () => {
  assert.equal(api.ACTIONS.length, 17); assert.equal(api.DEFAULT_BINDINGS.strike, 'KeyG');
  const { strike, ...v18 } = api.DEFAULT_BINDINGS; void strike;
  const migrated = api.keyBindingsSchema.parse(v18);
  assert.equal(migrated.strike, 'KeyG'); assert.equal(new Set(Object.values(migrated)).size, 17);
  const clash = api.keyBindingsSchema.parse({ ...v18, camera: 'KeyG' });
  assert.notEqual(clash.strike, 'KeyG', 'does not steal a key the player already assigned'); assert.equal(clash.camera, 'KeyG');
  const swapped = api.remapBinding(api.DEFAULT_BINDINGS, 'strike', 'KeyT');
  assert.equal(swapped.strike, 'KeyT'); assert.equal(new Set(Object.values(swapped)).size, 17);
  assert.equal(api.remapBinding(api.DEFAULT_BINDINGS, 'strike', 'KeyW').forward, 'KeyG', 'conflicting key swaps');
  // saved v1.8 controller config without buttonStrike keeps its mapping and gains the default
  const { buttonStrike, ...old } = { ...api.HOTAS_PRESET, buttonFire: 9 }; void buttonStrike;
  assert.equal(api.controllerSchema.safeParse(old).success, false, 'strict schema needs the field');
  assert.equal(typeof api.HOTAS_PRESET.buttonStrike, 'number'); assert.equal(typeof api.XBOX_PRESET.buttonStrike, 'number');
  // HOTAS button press -> a single strike edge
  const poller = new api.ControllerPoller();
  const pad = pressed => ({ index: 0, id: 'hotas', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });
  assert.equal(poller.sample(api.HOTAS_PRESET, [pad([])]).strike, false);
  assert.equal(poller.sample(api.HOTAS_PRESET, [pad([api.HOTAS_PRESET.buttonStrike])]).strike, true);
  assert.equal(poller.sample(api.HOTAS_PRESET, [pad([api.HOTAS_PRESET.buttonStrike])]).strike, false, 'held button is not a repeat');
});

test('AC-UX-2 report counters: rating from arcade counters and best one-shot chain', () => {
  assert.equal(api.arcadeRating({ propsDestroyed: 0, bestCombo: 0, bestChain: 0 }), 'B');
  assert.equal(api.arcadeRating({ propsDestroyed: 5, bestCombo: 1, bestChain: 3 }), 'A');
  assert.equal(api.arcadeRating({ propsDestroyed: 9, bestCombo: 5, bestChain: 5 }), 'S');
  const { game } = make('drive', 0, 12, false);
  game.arcade.clear(); game.enemies.length = 0;
  for (let i = 0; i < 4; i++) game.arcade.props.push({ id: 200 + i, kind: 'barrel', x: i * 4, z: 40, radius: 1, height: 3.4, alive: true, root: new api.Group() });
  game.blastProp(game.arcade.props[0], true); run(game, 3);
  assert.equal(game.arcade.propsDestroyed, 4); assert.equal(game.arcade.bestChain, 4, 'one shot set off four props');
});

test('AC-FX-7 ammo-rack cook-off: deterministic per seed, ammo blast event, turret lands within 2 s and is restored on restart', () => {
  const outcomes = seed => { const { game } = make('battle', 0, seed, false); game.enemies.length = 0; game.arcade.clear();
    const v = api.createActor(api.TANKS[0], 0, 40, true); game.enemies.push(v); v.alive = false; v.hp = 0; v.visual.wreckAge = 0;
    game.cookOff({ zone: 'turret', face: 'rear', bearing: 0, position: v.visual.root.position.clone() });
    return { game, v }; };
  let triggered = 0, quiet = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const first = outcomes(seed), again = outcomes(seed);
    assert.equal(api.isTurretLaunched(first.v.visual), api.isTurretLaunched(again.v.visual), `seed ${seed} deterministic`);
    assert.equal(api.isTurretLaunched(first.v.visual), api.shouldCookOff(seed, 0, 'turret', 'rear'));
    if (api.isTurretLaunched(first.v.visual)) triggered++; else quiet++;
  }
  assert.ok(triggered >= 10 && quiet >= 10, `roughly half cook off (${triggered}/${quiet})`);
  const seed = [...Array(40).keys()].map(i => i + 1).find(s => api.shouldCookOff(s, 0, 'turret', 'rear'));
  const { game, v } = outcomes(seed);
  assert.equal(api.isTurretFlying(v.visual), true);
  for (let i = 0; i < Math.round(2.1 * 60); i++) game.update(1 / 60, idle);
  assert.equal(api.isTurretFlying(v.visual), false, 'turret has landed within 2 s');
  assert.equal(api.shouldCookOff(seed, 0, 'leftTrack', 'side'), false, 'tracks never cook off');
  game.garage();
  assert.equal(api.isTurretLaunched(v.visual), false, 'turret re-seated on restart');
});
