import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export { Game } from './src/game.ts';
  export { createWorld } from './src/render/world.ts';
  export { pilotInput } from './scripts/pilot-input.ts';
  export { TANKS } from './src/data/tanks.ts';
  export { blocked } from './src/math.ts';
  export { Scene } from 'three';
` }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const world = api.createWorld(); delete globalThis.document;
const game = new api.Game(new api.Scene(), world, { shot() {}, hit() {}, finish() {}, notify() {} });
const results = [];
for (let mission = 0; mission < 6; mission++) {
  game.select(api.TANKS[0]);
  game.start('campaign', mission, 'training', 71439);
  for (let frame = 0; frame < 340 * 60 && game.phase === 'playing'; frame++) {
    const patrol = [[0, 18], [18, 0], [0, -18], [-18, 0]][Math.floor(game.elapsed / 5) % 4];
    game.update(1 / 60, api.pilotInput(game, mission === 5 ? patrol : [0, 16]));
    const position = game.player.visual.root.position;
    assert.equal(api.blocked(position.x, position.z, world.obstacles), false, 'Driving must preserve vehicle clearance in the real city');
  }
  const result = { mission: mission + 1, vehicle: game.player.spec.id, kind: game.mission.objective.kind, phase: game.phase, elapsed: game.elapsed,
    hp: game.player.hp, kills: game.kills, shots: game.shots, hits: game.hits, objective: { ...game.objective },
    position: game.player.visual.root.position.toArray(), enemies: game.enemies.filter(enemy => enemy.alive).map(enemy => ({ position: enemy.visual.root.position.toArray(), hp: enemy.hp, tactic: enemy.tactic })) };
  results.push(result); console.log(JSON.stringify(result));
}
game.garage();
await mkdir('.omo/evidence', { recursive: true });
await writeFile('.omo/evidence/campaign-check.json', JSON.stringify({ results, method: 'All six missions in full city obstacles, training difficulty, fixed 60 Hz, Leopard 2 A8 input-only pilot. Final defence patrols four points with 5-second orders. Every step checks real building clearance. No health, cooldown, position or outcome overrides.' }, null, 2));
assert.ok(results.every(result => result.phase === 'victory'), 'Every campaign must be completable through movement and fire inputs');
