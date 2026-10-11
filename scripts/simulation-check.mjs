import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidencePath = new URL('../.omo/evidence/', import.meta.url);
const sourceFiles = ['src/game.ts', 'src/combat.ts', 'src/actors.ts', 'src/math.ts',
  'src/effects.ts', 'src/persistence.ts', 'src/data/missions.ts', 'src/data/tanks.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path =>
  [path, createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex')])));
const beforeHashes = await hashes();
const bundle = await build({ stdin: { resolveDir: root, contents: `
  export { Game } from './src/game.ts';
  export { Combat } from './src/combat.ts';
  export { Effects } from './src/effects.ts';
  export { createActor } from './src/actors.ts';
  export { wallFraction, segmentSphere } from './src/math.ts';
  export { TANKS } from './src/data/tanks.ts';
  export { MISSIONS } from './src/data/missions.ts';
  export { loadProgress, saveProgress } from './src/persistence.ts';
  export { Scene, Group } from 'three';
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const output = bundle.outputFiles[0];
assert.ok(output, 'esbuild must produce the in-memory simulation harness');
const { Game, Combat, Effects, createActor, wallFraction, segmentSphere, TANKS, MISSIONS,
  loadProgress, saveProgress, Scene, Group } = await import(`data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`);
const dt = 1 / 60;
const rest = Object.freeze({ throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false,
  brake: false, scope: false, toggleCamera: false, pause: false });
const checks = [];
let seed = 0x4b4f574c;
const originalRandom = Math.random;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rounded = number => Number(number.toFixed(6));
function check(name, run) {
  try { const observed = run(); checks.push({ name, status: 'pass', observed }); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    checks.push({ name, status: 'fail', error: error.message, stack: error.stack?.split('\n').slice(0, 5) });
  }
}
function fixture(obstacles = []) {
  const scene = new Scene(), shots = [], hits = [], finishes = [];
  let game;
  game = new Game(scene, { group: new Group(), obstacles, size: 460 }, {
    shot: () => shots.push(game.elapsed), hit: (damage, killed, enemy) => hits.push({ damage, killed, enemy }),
    finish: victory => finishes.push(victory), notify: () => {},
  });
  return { game, scene, shots, hits, finishes };
}
function advance(game, seconds, input = rest) {
  for (let step = 0; step < Math.round(seconds / dt); step++) game.update(dt, input);
}
function actorSnapshot(actor) {
  return { hp: actor.hp, alive: actor.alive, speed: actor.speed, cooldown: actor.cooldown,
    yaw: actor.yaw, aim: actor.aim, pitch: actor.pitch, position: actor.visual.root.position.toArray() };
}
function snapshot(game, scene) {
  return { phase: game.phase, elapsed: game.elapsed, shots: game.shots, hits: game.hits, kills: game.kills,
    player: actorSnapshot(game.player), enemies: game.enemies.map(actorSnapshot),
    sceneNodes: scene.children.map(node => ({ type: node.type, position: node.position.toArray(), scale: node.scale.toArray() })) };
}
function firstMission() {
  seed = 0x4b4f574c;
  const { game, shots, finishes } = fixture(); game.start('campaign', 0);
  for (let step = 0; step < 210 * 60 + 1 && game.phase === 'playing'; step++) game.update(dt, { ...rest, fire: true });
  const result = { phase: game.phase, kills: game.kills, hits: game.hits, shots: game.shots,
    elapsed: rounded(game.elapsed), hp: game.player.hp, shotTimes: shots.map(rounded), finishes,
    missionId: game.mission?.id, enemyHealth: game.enemies.map(actor => actor.hp) };
  assert.equal(game.phase, 'victory', 'First campaign must be winnable with actual continuous fire');
  assert.equal(game.kills, 2); assert.ok(game.hits >= 2); assert.ok(game.player.hp > 0);
  assert.deepEqual(finishes, [true]); game.garage(); return result;
}
let campaignResult;
try {
  check('first-campaign-held-fire-completion-and-deterministic-repeat', () => {
    campaignResult = firstMission(); assert.deepEqual(firstMission(), campaignResult); return campaignResult;
  });
  check('reload-rate-limits-continuously-held-fire', () => {
    const { game, shots } = fixture(); game.start('drive', 0); advance(game, 15, { ...rest, fire: true });
    assert.equal(shots.length, 3, 'A 5.5-second reload permits three shots in the first 15 seconds');
    const intervals = shots.slice(1).map((time, index) => time - shots[index]);
    for (const interval of intervals) {
      assert.ok(interval >= game.player.spec.reload - 1e-8, 'No shell may fire before reloading completes');
      assert.ok(interval <= game.player.spec.reload + dt * 2, 'Held fire must resume promptly after reload');
    }
    const result = { shots: shots.map(rounded), intervals: intervals.map(rounded), reloadSeconds: game.player.spec.reload };
    game.garage(); return result;
  });
  check('pause-freezes-clock-actors-health-and-live-projectiles', () => {
    const { game, scene, shots, hits } = fixture(); game.start('campaign', 0);
    game.update(dt, { ...rest, fire: true, throttle: 1 }); game.pause();
    const before = snapshot(game, scene), count = { shots: shots.length, hits: hits.length };
    assert.ok(before.sceneNodes.filter(node => node.type === 'Mesh').length >= 2, 'Pause fixture must contain a fired shell and burst');
    advance(game, 10, { ...rest, fire: true, throttle: 1, steer: 1, aimX: 1 });
    assert.deepEqual(snapshot(game, scene), before); assert.deepEqual({ shots: shots.length, hits: hits.length }, count);
    game.resume(); advance(game, 2); assert.ok(game.elapsed > before.elapsed); assert.ok(hits.length > count.hits, 'The paused shell must resume and hit after unpausing');
    const result = { pausedFrames: 600, elapsedFrozenAt: rounded(before.elapsed),
      transientMeshes: before.sceneNodes.filter(node => node.type === 'Mesh').length, hitsAfterResume: hits.length };
    game.garage(); return result;
  });
  check('forward-reverse-brake-steering-and-independent-turret', () => {
    const { game } = fixture(); game.start('drive', 0);
    const startZ = game.player.visual.root.position.z;
    advance(game, 3, { ...rest, throttle: 1 }); const forwardZ = game.player.visual.root.position.z;
    assert.ok(forwardZ < startZ - 10 && game.player.speed > 0);
    advance(game, 1, { ...rest, brake: true }); assert.equal(game.player.speed, 0);
    const stoppedZ = game.player.visual.root.position.z;
    advance(game, 2, { ...rest, throttle: -1 }); const reverseZ = game.player.visual.root.position.z;
    assert.ok(reverseZ > stoppedZ + 2 && game.player.speed < 0);
    advance(game, 1, { ...rest, brake: true, steer: 1 }); assert.ok(Math.abs(game.player.yaw) > 0.5);
    const yaw = game.player.yaw, aim = game.player.aim;
    advance(game, 1, { ...rest, aimX: 1, aimY: 1 });
    assert.equal(game.player.yaw, yaw); assert.ok(game.player.aim < aim - 0.5); assert.ok(game.player.pitch > 0.1);
    const result = { startZ, forwardZ: rounded(forwardZ), stoppedZ: rounded(stoppedZ), reverseZ: rounded(reverseZ),
      yaw: rounded(yaw), turretAim: rounded(game.player.aim), pitch: rounded(game.player.pitch) };
    game.garage(); return result;
  });
  check('solid-wall-stops-driving-while-open-control-passes', () => {
    const wall = { x: 0, z: 80, halfX: 8, halfZ: 2 };
    const blocked = fixture([wall]), open = fixture();
    for (const item of [blocked, open]) { item.game.start('drive', 0); advance(item.game, 5, { ...rest, throttle: 1 }); }
    const blockedZ = blocked.game.player.visual.root.position.z, openZ = open.game.player.visual.root.position.z;
    assert.ok(blockedZ > 82, 'Tank must stop before the front wall surface'); assert.ok(openZ < 78, 'Unobstructed control must pass the same location');
    blocked.game.garage(); open.game.garage(); return { wallFrontZ: 82, blockedZ: rounded(blockedZ), openZ: rounded(openZ) };
  });
  check('normal-wall-and-muzzle-near-wall-block-shells', () => {
    const shoot = obstacles => {
      const scene = new Scene(), effects = new Effects(scene), hits = [];
      const shooter = createActor(TANKS[0], 0, 0), target = createActor(TANKS[4], 0, -40, true);
      scene.add(shooter.visual.root, target.visual.root);
      const combat = new Combat(scene, effects, { shot: () => {}, hit: damage => hits.push(damage) });
      const beforeHp = target.hp; assert.equal(combat.fire(shooter, obstacles), true);
      for (let step = 0; step < 60; step++) { combat.update(dt, [shooter, target], obstacles, 1); effects.update(dt); }
      const result = { beforeHp, afterHp: target.hp, hits }; combat.clear(); effects.clear(); return result;
    };
    const open = shoot([]), distantWall = shoot([{ x: 0, z: -20, halfX: 4, halfZ: 1 }]);
    const muzzleWall = shoot([{ x: 0, z: -3, halfX: 4, halfZ: 0.2 }]);
    assert.ok(open.afterHp < open.beforeHp); assert.equal(open.hits.length, 1);
    for (const blocked of [distantWall, muzzleWall]) { assert.equal(blocked.afterHp, blocked.beforeHp); assert.deepEqual(blocked.hits, []); }
    return { open, distantWall, muzzleWall };
  });
  check('continuous-sweeps-cover-thin-wall-and-sphere-intersections', () => {
    const wall = { x: 0, z: -10, halfX: 2, halfZ: 0.1 };
    const wallHit = wallFraction(0, 0, 0, -100, [wall]);
    assert.ok(Math.abs(wallHit - 0.099) < 1e-8); assert.equal(wallFraction(10, 0, 0, -100, [wall]), 1);
    const sphereHit = segmentSphere(0, 0, 0, 0, 0, -20, 0, 0, -10, 2);
    assert.ok(Math.abs(sphereHit - 0.4) < 1e-8);
    assert.equal(segmentSphere(0, 5, 0, 0, 0, -20, 0, 0, -10, 2), null); return { wallHit, sphereHit };
  });
  check('all-six-mission-spawns-and-thirty-selectable-tanks', () => {
    const { game } = fixture(), missions = [];
    assert.equal(MISSIONS.length, 6); assert.equal(new Set(TANKS.map(tank => tank.id)).size, 30);
    for (const tank of TANKS) { game.select(tank); assert.equal(game.player.visual.root.name, tank.name); assert.ok(game.player.hp > 0); }
    for (const [index, expectedCount] of [2, 3, 4, 5, 6, 8].entries()) {
      game.start('campaign', index); assert.equal(game.enemies.length, expectedCount); assert.equal(game.phase, 'playing');
      const positions = [game.player, ...game.enemies].map(actor => actor.visual.root.position);
      for (const [positionIndex, position] of positions.entries()) {
        assert.ok(Math.abs(position.x) < 223 && Math.abs(position.z) < 223);
        for (const other of positions.slice(positionIndex + 1)) assert.ok(position.distanceTo(other) >= 4.7, 'Mission must not spawn overlapping actors');
      }
      missions.push({ id: game.mission.id, targets: game.enemies.length, timeLimit: game.mission.timeLimit, spawn: positions[0].toArray() });
    }
    game.garage(); return { tanksSelected: TANKS.length, missions, completionCoverage: 'Only mission 1 is completed end-to-end in this harness.' };
  });
  check('progress-input-validation-roundtrip-and-storage-denial', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), data = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
    try {
      assert.equal(loadProgress().completed, 0); assert.equal(campaignResult?.phase, 'victory');
      const progress = { completed: campaignResult.missionId, victories: 1, bestScores: {} };
      assert.equal(saveProgress(progress), true); assert.deepEqual(loadProgress(), progress);
      for (const raw of ['{broken', '{"completed":99,"victories":1}', '{"completed":-1}', '{"completed":1.5}']) {
        data.set('kowloon-armor-progress', raw); assert.equal(loadProgress().completed, 0);
      }
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: () => { throw new DOMException('Denied', 'SecurityError'); },
        setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); },
      } });
      assert.equal(loadProgress().completed, 0); assert.equal(saveProgress(progress), false);
      return { roundtrip: progress, invalidInputsRejected: 4, deniedLoadFallsBack: true, deniedSaveReturnsFalse: true, uiUnlockVerified: false };
    } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
  });
} finally { Math.random = originalRandom; }
const afterHashes = await hashes(), sourceStable = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);
const hypotheses = [
  ['H1', 'Held fire could bypass reload or fail to fire again after loading.', 'reload-rate-limits-continuously-held-fire'],
  ['H2', 'Pause could freeze the clock while shells, actor movement or damage continue.', 'pause-freezes-clock-actors-health-and-live-projectiles'],
  ['H3', 'A muzzle offset could let shells spawn beyond a nearby thin wall and hit through it.', 'normal-wall-and-muzzle-near-wall-block-shells'],
  ['H4', 'The first campaign could be unwinnable through real input and damage processing.', 'first-campaign-held-fire-completion-and-deterministic-repeat'],
].map(([id, hypothesis, test]) => ({ id, hypothesis, result: checks.find(check => check.name === test)?.status === 'pass' ? 'refuted' : 'unresolved', evidence: test }));
const report = { generatedAt: new Date().toISOString(), command: 'node scripts/simulation-check.mjs', dt, seed: '0x4b4f574c',
  sourceStable, sourceHashes: afterHashes, passed: checks.filter(check => check.status === 'pass').length,
  failed: checks.filter(check => check.status === 'fail').length, hypotheses, checks,
  limitations: ['No WebGL/browser rendering or physical HOTAS is exercised.', 'Full campaign completion uses the empty-obstacle fixture only for mission 1; missions 2–6 receive spawn checks.',
    'Progress storage functions are tested with synthetic Storage; browser unlock/navigation is separate QA.', 'No player/enemy HP, cooldown, position or Game phase is directly assigned by the harness.'] };
await mkdir(evidencePath, { recursive: true });
await writeFile(new URL('simulation-results.json', evidencePath), JSON.stringify(report, null, 2));
await writeFile(new URL('simulation-results.md', evidencePath), `# Simulation verification\n\nCommand: \`node scripts/simulation-check.mjs\`\n\n${report.passed} passed; ${report.failed} failed. Source unchanged during run: ${sourceStable}.\n\n${checks.map(check => `- ${check.status.toUpperCase()}: ${check.name}`).join('\n')}\n\nFirst mission: ${JSON.stringify(campaignResult)}\n\n## Scope\n\n${report.limitations.map(item => `- ${item}`).join('\n')}\n`);
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, sourceStable, firstMission: campaignResult, evidence: '.omo/evidence/simulation-results.json' }, null, 2));
if (report.failed > 0 || !sourceStable) process.exitCode = 1;
